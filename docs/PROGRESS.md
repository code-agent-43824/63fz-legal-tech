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
