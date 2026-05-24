# Development Plan

## Step 0. Environment Reconnaissance

Status: completed.

Findings:

- GitHub CLI is authenticated as `code-agent-43824`.
- Repository: `https://github.com/code-agent-43824/63fz-legal-tech`.
- VDSina host alias: `mescheryakov-pro`, user `openclaw`.
- Existing public site root: `/home/openclaw/sites/mescheryakov.pro/public`.
- Caddy imports `/etc/caddy/sites/*.caddy`.
- Active site config: `/etc/caddy/sites/mescheryakov.pro.caddy`.
- Existing Caddy pattern already proxies subpaths, for example `/pdf-signing/*` to `127.0.0.1:3010`.

Chosen deployment approach:

- Run the 63-FZ app as a separate service on a loopback-only port.
- Proxy only `/63fz` and `/63fz/*` from Caddy to that service.
- Leave the existing static site root untouched.

Main risks:

- Next.js must be configured for `basePath: "/63fz"` so assets and client routing work under a subpath.
- Caddy changes must be backed up before editing.
- The existing `mescheryakov.pro` routes must keep working after reload.

## Step 1. Application Skeleton

- Create a Next.js + TypeScript + Tailwind app.
- Configure `basePath: "/63fz"`.
- Add a minimal public `/63fz` page.
- Run local lint/type/build checks.

## Step 2. Database And Prisma

- Add PostgreSQL and Prisma.
- Model laws, versions, fragments, explanations, expert comments, issues, and proposed revisions.
- Add idempotent DEMO DATA seed.

## Step 3. Public Reader

- Add table of contents.
- Add law reading screen.
- Add direct fragment URLs.
- Add two-column original/commentary layout.
- Add empty states for missing commentary.

## Step 4. Admin

- Add simple password-based admin auth using `ADMIN_PASSWORD`.
- Add protected CRUD for explanations, expert comments, issues, and proposed revisions.
- Keep original law text read-only in the MVP admin UI.

## Step 5. Import

- Add structured file import.
- Add dry-run report.
- Generate stable IDs and anchors.
- Avoid fragile parsing that silently damages law structure.

## Step 6. Search

- Add simple database-backed search over original text, explanations, and expert comments.
- Link results to exact fragments.

## Step 7. Markdown Export

- Add protected `/63fz/export/improved.md`.
- Use accepted proposed revisions where present.
- Include a change rationale section.

## Step 8. Production Deploy

- Add Docker Compose deployment files.
- Keep env files out of git.
- Back up Caddy config before editing.
- Add Caddy route for `/63fz`.
- Verify public URL, assets, admin protection, logs, persistence, and existing site routes.

