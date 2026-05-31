# Progress Log

## 2026-05-24

- Created public GitHub repository `code-agent-43824/63fz-legal-tech`.
- Completed read-only reconnaissance of `mescheryakov.pro` on VDSina.
- Selected isolated deployment approach: separate app service behind Caddy `/63fz` route.
- Added project rules and step plan.

Next safe step: scaffold the Next.js application with `basePath: "/63fz"`.

## Step 1. Application Skeleton

- Added a minimal Next.js, TypeScript, and Tailwind application.
- Configured `next.config.ts` with `basePath: "/63fz"`.
- Added a public scaffold page with clearly marked DEMO DATA, table of contents, stable fragment anchors, and a two-column original/commentary layout.
- Verified:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - local dev server responds at `http://127.0.0.1:3630/63fz`
  - generated asset URLs are under `/63fz/_next/...`

Known issue:

- `npm audit` reports a moderate transitive `postcss` advisory through current stable Next.js `16.2.6`. The suggested npm fix downgrades Next to `9.3.3`, so it is not acceptable. Revisit when a stable patched Next.js release is available.

Next safe step: add database, Prisma schema, migrations, and idempotent DEMO DATA seed.

## Step 2. Database And Prisma

- Added Docker Compose definition for local PostgreSQL on `127.0.0.1:5439`.
- Added Prisma 6 schema for:
  - `Law`
  - `LawVersion`
  - `LawFragment`
  - `PlainExplanation`
  - `ExpertComment`
  - `Issue`
  - `ProposedRevision`
- Added generated initial SQL migration.
- Added idempotent seed script with explicit DEMO DATA only.
- Verified:
  - `npx prisma format`
  - `npx prisma generate`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`

Local limitation:

- Docker is not installed on the current OpenClaw host, so the PostgreSQL container and migration execution could not be run locally here. The schema was validated and the SQL migration was generated with Prisma. Full migration/seed execution must be verified on the deployment host or another environment with Docker/PostgreSQL.

Next safe step: connect the public reader to seeded database content instead of hard-coded demo fragments.

## Step 3. Public Reader Data Source

- Moved reader content loading into `src/lib/law-data.ts`.
- Added Prisma-backed loading for the current `63fz` law version, including published explanations, expert comments, active issues, and proposed revisions.
- Kept a DEMO DATA fallback when `DATABASE_URL` is absent, so local builds remain deterministic before database provisioning.
- Marked the page as dynamic because production reader data is database-backed.
- Disabled generated typed route imports in `next.config.ts` to prevent `next-env.d.ts` from flipping between dev and build output.
- Verified:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - local HTTP check at `/63fz`

Next safe step: implement minimal admin authentication and protected admin shell before adding write forms.

## Step 4. Admin Authentication Shell

- Added password-based admin login at `/63fz/admin/login`.
- Added signed httpOnly cookie session scoped to `/63fz`.
- Added protected `/63fz/admin` shell with fragment list and content counters.
- Added `ADMIN_PASSWORD` guard: login is blocked when the password is unset or left as the example value.
- Did not add write endpoints yet.
- Verified:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - unauthenticated `/63fz/admin` redirects to `/63fz/admin/login`

Next safe step: add protected edit pages and CRUD server actions for explanations, expert comments, issues, and proposed revisions.

## Step 4. Fragment CRUD Forms

- Added protected `/63fz/admin/fragments/[id]` page.
- Added read-only original text display for a fragment.
- Added protected server actions for create, update, and delete operations on:
  - plain explanations
  - expert comments
  - issues / disputed places
  - proposed revisions
- Every write action checks admin authentication and refuses to run without `DATABASE_URL`.
- Verified:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - unauthenticated fragment edit URL redirects to `/63fz/admin/login`

Next safe step: run the database migration and seed in an environment with PostgreSQL, then verify the full admin create/update/delete flow against real database rows.

## Deployment Constraint

- VDSina host has about 853 MiB free on `/` and no Docker/Podman in PATH.
- Installing Docker plus pulling images is risky on this disk size.
- Existing `/home/openclaw/runtime/node/bin/node` is available, so the first safe deployment path is a Next.js standalone build behind a systemd user service and Caddy `/63fz` proxy.
- This first deployment can expose the public DEMO DATA reader and protected admin shell, but database-backed writes still require PostgreSQL provisioning.

## First Production Deploy

- Built a Next.js standalone artifact from commit `b6ac34c`.
- Deployed it to VDSina under `/home/openclaw/services/63fz-legal-tech/releases/b6ac34c`.
- Added and started user service `63fz-legal-tech.service` on `127.0.0.1:3011`.
- Backed up Caddy config before editing:
  - `/home/openclaw/backups/63fz-legal-tech/20260524T201644Z/mescheryakov.pro.caddy`
  - `/home/openclaw/backups/63fz-legal-tech/20260524T201739Z-fix-63fz-route/mescheryakov.pro.caddy`
- Added Caddy proxy handles for `/63fz` and `/63fz/*`.
- Verified:
  - `https://mescheryakov.pro/63fz` returns 200 and renders the DEMO DATA reader.
  - `/63fz/_next/static/...` assets return 200.
  - unauthenticated `https://mescheryakov.pro/63fz/admin` redirects to `/63fz/admin/login`.
  - existing root `https://mescheryakov.pro/` still returns 200 and contains the original site title.
  - existing `https://mescheryakov.pro/pdf-signing/` still returns 200.
  - `63fz-legal-tech.service` is active with `NRestarts=0`.

Remaining deployment gap:

- This is a public scaffold deployment without PostgreSQL connected. Database-backed admin writes, migrations, seed, search, and export are still pending.

## Database Production Connection

- Installed minimal PostgreSQL 18 on VDSina without Docker.
- Created database `fz63_legal_tech` and app role `fz63_app`.
- Applied the initial SQL migration.
- Loaded idempotent DEMO DATA seed into PostgreSQL.
- Stored app secrets in `/home/openclaw/services/63fz-legal-tech/.env.production` with mode `600`.
- Updated `63fz-legal-tech.service` to load `EnvironmentFile=/home/openclaw/services/63fz-legal-tech/.env.production`.
- Granted the app role access to the migrated tables and restarted the service.
- Verified:
  - public `/63fz` reads DEMO DATA from PostgreSQL;
  - `/63fz/admin` login works with the generated admin password;
  - authenticated admin fragment list loads database rows;
  - protected server action created a published plain explanation in the database;
  - service remains active with `NRestarts=0`.

Follow-up fix:

- Updated the public reader to display all published plain explanations for a fragment, not only the first one, so admin-created explanations are visible.
- Redeployed commit `9fea551` to VDSina and restarted `63fz-legal-tech.service`.
- Verified public HTTPS page shows a published explanation created through the admin form.
- Current production state:
  - `https://mescheryakov.pro/63fz` returns 200.
  - `https://mescheryakov.pro/63fz/admin` redirects to login when unauthenticated.
  - existing root site and `/pdf-signing/` still return 200.
  - PostgreSQL is active; current DEMO DATA counts are 3 law fragments and 2 plain explanations.
  - root filesystem is tight at about 94% used after PostgreSQL installation.

## 2026-05-31. Build Hygiene And Status Docs

- Added automatic Prisma Client generation to the package lifecycle:
  - `postinstall` runs `prisma generate`;
  - `build` runs `prisma generate` before `next build`.
- Updated README current status from the initial planning/scaffolding note to the deployed database-backed DEMO DATA scaffold state.

Why:

- A clean dependency install can leave generated Prisma Client types unavailable until `prisma generate` runs.
- The production build should be reproducible from a clean checkout without a hidden manual Prisma step.

Verified:

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run build`

Next safe step: implement the verified current 63-FZ import pipeline with source metadata, stable fragment IDs, checksums, dry-run reporting, and change-match data needed for the future version timeline.

## 2026-05-31. Current 63-FZ Text Import

- Added `scripts/import-63fz.ts` for reproducible import of the current consolidated 63-FZ text from a recorded source.
- Added `pnpm law:import:63fz` command.
- Added source-audit fields to `LawVersion`:
  - `sourceName`
  - `sourceRetrievedAt`
  - `sourceHtmlSha256`
  - `sourceTextSha256`
- Generated and reviewed a dry-run report before writing production data:
  - source: `Контур.Норматив`
  - source URL: `https://normativ.kontur.ru/document?documentId=504436&moduleId=1`
  - revision date: `2025-07-31`
  - effective date: `2026-03-01`
  - normalized law text SHA-256: `5b21431aed777c7c7e337e7fd3e391a7e8b40055373932dfb8a5bc9981e20840`
  - parsed fragments: 30 total, including preamble and 29 articles
  - article sequence: `1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 16.1, 17, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 18, 18.1, 18.2, 19, 20`
  - parser warnings: none
- Backed up the production PostgreSQL database before import:
  - `/home/openclaw/backups/63fz-legal-tech/20260531T155524Z/fz63_legal_tech_before_import.sql`
- Applied the source-audit migration on production PostgreSQL.
- Imported the current version into production database as `63fz-current-2025-07-31` and set it as `Law.currentVersionId`.

Verified:

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run build`
- production DB current version has 30 imported fragments and the expected normalized text checksum
- `https://mescheryakov.pro/63fz` returns 200 and renders the imported law text; `DEMO DATA` is no longer present in the public HTML
- existing `https://mescheryakov.pro/` and `https://mescheryakov.pro/pdf-signing/` still return 200
- `63fz-legal-tech.service` remains active/running with `NRestarts=0`

Current limitation:

- The imported production fragments are preamble + article-level fragments. The article text is exact consolidated text from the source after removing editorial amendment notes, but deeper part/point/paragraph splitting remains the next parser refinement before timeline-aware comment inheritance.
