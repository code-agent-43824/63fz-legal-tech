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
