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
- Database: PostgreSQL on the same host (*verify connection details on host*).

Required environment variables (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string; without it the app serves DEMO DATA. |
| `ADMIN_PASSWORD` | Admin login; ≥ 12 chars, non-example (enforced at runtime). |
| `AUTH_SECRET` | HMAC key for session cookies; ≥ 32 chars, non-example (enforced). |
| `NEXT_PUBLIC_BASE_PATH` | Base path baked in at build time; default `/63fz`, empty = root. |
| `READER_SNAPSHOT_MARKER_FILE` | Optional override of the reader-cache marker file; restricted to `/tmp`, `/var/tmp`, or the OS temp dir. |

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
- A backup that has never been test-restored is not a backup: periodically verify a restore into a
  scratch database (*no restore verification has been recorded in PROGRESS.md yet*).

## Database migrations

**Current reality:** the production database predates a clean Prisma migration history; the
`_prisma_migrations` table does not reflect `prisma/migrations/` (*verify exact state on host*).
Until that is reconciled (roadmap point 16), treat every schema change as a manual operation:

1. Take a fresh `pg_dump` backup.
2. Review the generated SQL (`prisma migrate diff` / the migration file) before applying.
3. Apply on production explicitly; do not assume `prisma migrate deploy` is safe until the
   migration history has been reconciled.
4. Record what was applied, when, and where the backup is, in `docs/PROGRESS.md`.

Do not start roadmap work that adds tables (feedback dashboard, multi-user auth) before this
reconciliation is done.

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
