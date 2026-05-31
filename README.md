# 63fz Legal Tech

MVP legal-tech CMS for structured reading and expert commenting of Federal Law 63-FZ "On Electronic Signature".

Production target: `https://mescheryakov.pro/63fz`.

## Development Principles

- Keep implementation simple and observable.
- Make small, reviewable commits for each meaningful change.
- Do not mix original law text with explanations, comments, issues, or proposed revisions.
- Do not invent law text or expert comments.
- Mark all fixture content as `DEMO DATA` until a verified source is imported.
- Do not commit secrets, `.env` files, passwords, private keys, or tokens.
- Protect every write endpoint.
- Do not change the existing `mescheryakov.pro` site outside the `/63fz` route.

## Current Status

Deployed MVP scaffold with database-backed DEMO DATA.

- Production URL: `https://mescheryakov.pro/63fz`.
- Runtime: isolated Next.js service behind the existing `mescheryakov.pro` Caddy route.
- Database: PostgreSQL-backed Prisma schema for law versions, stable law fragments, explanations, expert comments, issues, and proposed revisions.
- Admin: password-protected fragment editing for commentary and proposed revisions; original law text remains read-only.
- Current content: DEMO DATA only. A verified import of the current 63-FZ text is the next product step.
- Build hygiene: Prisma Client is generated automatically during install and before `next build`.

Useful local checks:

```bash
pnpm run typecheck
pnpm run lint
pnpm run build
```

See:

- [Development Plan](docs/PLAN.md)
- [Progress Log](docs/PROGRESS.md)
