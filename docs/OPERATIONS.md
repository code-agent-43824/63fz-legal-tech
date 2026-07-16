# Operations Runbook

Deployment, backup, migration, and cache-invalidation procedures for the current test placement.
This runbook is reconstructed from the deployment records in `docs/PROGRESS.md`; items marked
*verify on host* should be confirmed against the real server before being relied on.

## Environment overview

- Host: VDSina VDS, reverse proxy Caddy, app served under `https://mescheryakov.pro/63fz`
  (test placement, not the final domain).
- App: systemd unit `63fz-legal-tech.service` running the Next.js standalone build
  (`WorkingDirectory=/home/openclaw/services/63fz-legal-tech/current`,
  `EnvironmentFile=/home/openclaw/services/63fz-legal-tech/.env.production`, `PrivateTmp=no` —
  confirmed on the host 2026-07-13).
- Releases live in `/home/openclaw/services/63fz-legal-tech/releases/<git-sha>`; the unit runs the
  `/home/openclaw/services/63fz-legal-tech/current` symlink (*verify on host*).
- Database: PostgreSQL 18 on the same host. Runtime and migration ownership are separated as
  described below.

Required environment variables (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string; without it the app serves DEMO DATA. |
| `ADMIN_PASSWORD` | Admin login; ≥ 12 chars, non-example (enforced at runtime). |
| `AUTH_SECRET` | HMAC key for session cookies; ≥ 32 chars, non-example (enforced). |
| `NEXT_PUBLIC_BASE_PATH` | Base path baked in at build time; default `/63fz`, empty = root. |
| `READER_SNAPSHOT_MARKER_FILE` | Optional override of the reader-cache marker file; restricted to `/tmp`, `/var/tmp`, or the OS temp dir. |

## Editorial accounts and access

- The environment administrator signs in as `admin` (or leaves the login field empty) using
  `ADMIN_PASSWORD`; this remains the recovery/bootstrap administrator and is not stored in the DB.
- Experts are invitation-only DB accounts created under `/63fz/admin/users`. Usernames are
  normalized lowercase; passwords are stored only as salted scrypt hashes.
- Disabling an expert invalidates the account on its next request even if its signed session cookie
  has not expired. Password reset does not reveal or log either old or new passwords.
- Experts can write only explanations, comments, recommendations, and assigned change explanations;
  they can edit only rows attributed to them. Administrators assign experts, moderate/unpublish,
  delete, manage accounts, edit issues/proposals, and download the Markdown export.
- Editorial material follows `draft -> in_review -> published -> unpublished`. Saving a reviewed or
  published item always resets it to `draft`. Only its responsible expert can submit and publish it;
  publication requires explicit factual/source/scope/version/responsibility confirmations.
- AI-assisted origin is permanent once set. It is visible in the queue and public disclosure after
  expert publication; no AI-assisted draft is public in `draft`, `in_review`, or `unpublished`.
- Corrections are made by editing the item (which returns it to draft), reviewing it again, and
  republishing. Urgent removal uses the separate unpublish control and does not alter official text.
- Account, session, contribution, and moderation events are stored in `EditorialAuditLog`; details
  are identifiers/statuses only, never passwords or full contribution text.

Production database credentials are deliberately split:

- `/home/openclaw/services/63fz-legal-tech/.env.production` (mode `600`) contains the application
  `DATABASE_URL` for restricted login role `fz63_app`.
- `/home/openclaw/services/63fz-legal-tech/.env.migrations` (mode `600`) contains a separate
  `DATABASE_URL` for `fz63_migrator`. It is for operator-run Prisma migration/preflight commands
  only and must never be loaded by `63fz-legal-tech.service`.
- `fz63_migrator` owns the database and public schema objects but is not superuser and cannot create
  roles or databases.
- `fz63_app` has schema `USAGE` plus CRUD on application tables and cannot `CREATE` in `public`.
- Default privileges grant runtime CRUD on future tables created by `fz63_migrator`.

## Deploy

1. CI on `master` must be green (prisma validate, typecheck, lint, tests incl. DB integration,
   build).
2. Build the release (`pnpm install --frozen-lockfile && pnpm run build`) and place the standalone
   output in `releases/<git-sha>`.
3. Preflight the candidate on a free local port before switching:
   - `GET /63fz` returns HTTP 200;
   - unauthenticated `GET /63fz/admin` and `/63fz/admin/export/markdown` redirect to
     `/63fz/admin/login`;
   - a sampled `/63fz/_next/static/...` asset is served.
4. Switch the `current` symlink to the new release and restart `63fz-legal-tech.service`.
5. Verify production:
   - `https://mescheryakov.pro/63fz` returns HTTP 200 and does **not** contain `DEMO DATA`
     (its presence means `DATABASE_URL` is missing/broken);
   - unauthenticated `/63fz/admin` still redirects to login;
   - `systemctl status 63fz-legal-tech` is active with `NRestarts=0`;
   - neighbor apps on the host (`/`, `/pdf-signing/`) still return HTTP 200.

## Rollback

Switch the `current` symlink back to the previous release directory and restart the service. Do not
delete old release directories until at least one newer release has been verified in production.

## Backups

- The importer refuses `--write` without creating a `pg_dump` backup first; default location is
  `.import/63fz-current/backups/` (override with `--backup-dir`).
- Before any schema migration or manual data surgery, take a manual `pg_dump` as well and record
  where it was stored.
- A backup that has never been test-restored is not a backup: restore into a uniquely named scratch
  database, compare deterministic row counts/content hashes, and remove only that scratch database.
- Latest verified full custom-format backup (2026-07-16):
  `/home/openclaw/backups/63fz-legal-tech/20260716T103510Z-before-point14-editorial-accounts/fz63_legal_tech.dump`,
  534819 bytes, SHA-256
  `949c1d74df813727c676bcdacccf2146428d70fe5990b3e6c5c5415e30227c3b`. It was restored into an
  isolated database; all nine pre-migration application-table counts and deterministic content
  hashes matched.
- Zero-byte files from earlier failed dump attempts are not backups. Never select a backup by name
  alone: require non-zero size, `pg_restore --list` success for custom dumps, and a recorded checksum.

## Database migrations

**Current reality (reconciled 2026-07-16):** `_prisma_migrations` records all six repository
migrations. The first four rows are intentional `prisma migrate resolve --applied` baselines and
therefore have `applied_steps_count=0`; the fifth and sixth migrations were executed normally. `prisma migrate
status` is current and `prisma migrate diff` reports no difference.

Before every schema change:

1. Confirm local `master` and CI are current; inspect the proposed migration SQL.
2. Take a fresh non-zero custom-format `pg_dump`, record SHA-256, and validate `pg_restore --list`.
3. Restore that backup into an isolated scratch database and compare row counts/content hashes.
4. Test the full migration chain from an empty scratch database and require `migrate diff` to report
   no difference.
5. Connect with `fz63_migrator` credentials only. Never run migrations with the application
   `fz63_app` URL or the application service environment.
6. Run `pnpm run db:ops:check`; it must report `PASS` before the change.
7. Run `prisma migrate deploy`, then `prisma migrate status`, `migrate diff`, and
   `pnpm run db:ops:check` again.
8. Compare application-table content invariants with the pre-change record and verify public/admin
   HTTP routes plus service health.
9. Record migration name, backup path/checksum, verification, and rollback boundary in
   `docs/PROGRESS.md`.

Never edit an already recorded migration file. A correction to migration-produced schema, including
an identifier-name correction, must be a new migration.

## Reader cache invalidation

The public reader keeps an in-process snapshot cache (`src/lib/reader-cache.ts`). Cross-process
invalidation uses a marker file (default `/tmp/63fz-legal-tech-reader-cache.invalidate`): the
import script touches it on write, and the server compares its mtime on reads.

**PrivateTmp status (verified on the host 2026-07-13):** the unit runs with `PrivateTmp=no`, the
marker file is visible to the service (checked via `/proc/<MainPID>/root/tmp`), and a shell
`touch` of the marker updates the mtime the service sees — CLI imports DO invalidate the running
server's cache. No restart after import is needed for this reason.

**Re-check this if the unit configuration ever changes:** with `PrivateTmp=true` the service's
`/tmp` is namespaced, a CLI import touches a *different* `/tmp`, and the server silently serves
stale content. Check with `systemctl show 63fz-legal-tech -p PrivateTmp` and compare marker mtimes
in `/tmp` vs `/proc/<MainPID>/root/tmp` after a `touch`. Note that `READER_SNAPSHOT_MARKER_FILE`
values outside `/tmp`, `/var/tmp`, or the OS temp dir are rejected back to the default, so sharing
a marker across a PrivateTmp boundary would require a code change extending the allowed
directories.

## `.import/` artifacts

All import/monitor state stays under `.import/` (gitignored):

- `.import/63fz-current/` — import reports (`*.json`: source checksums, fragment/type counts,
  reconstruction verification, comparison against the current version, warnings) and
  `backups/` with pre-write `pg_dump` files.
- `.import/amendment-monitor/` — `state.json` (last check, latest source revision identity,
  whether it is already imported) and human-readable check reports; the monitor never writes law
  text to the database.
- `.import/63fz-markdown/` — deterministic Markdown exports.
