# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Legal-tech reader and editorial CMS for Russian Federal Law 63-FZ "On Electronic Signature".
Next.js 16 (App Router) + TypeScript strict + Prisma 6 + PostgreSQL + Tailwind 4. Package manager
is pnpm (pinned `pnpm@11.5.0`, Node 24 in CI). UI text is in Russian. The app is deployed under a
configurable base path (`NEXT_PUBLIC_BASE_PATH`, default `/63fz`, baked in at build time;
standalone output). Never hardcode `/63fz` in code — use `withBasePath()` from
`src/lib/base-path.ts`. The current placement is a test one, not a permanent domain.

## Commands

```bash
pnpm install --frozen-lockfile   # postinstall runs prisma generate
docker compose up -d             # local PostgreSQL on 127.0.0.1:5439

pnpm run dev                     # dev server (page at /63fz)
pnpm run build                   # prisma generate && next build
pnpm run typecheck               # pretypecheck runs prisma generate
pnpm run lint
pnpm test                        # Node test runner via tsx over tests/**/*.test.ts
pnpm exec tsx --test tests/reader-cache.test.ts   # single test file
# DB integration test (opt-in; needs a DISPOSABLE migrated database, see README):
INTEGRATION_DATABASE_URL=postgresql://... pnpm test
pnpm run security:audit          # pnpm audit --prod

pnpm run prisma:validate         # uses hardcoded local DATABASE_URL, no DB needed
pnpm run prisma:migrate          # prisma migrate dev
pnpm run prisma:seed             # idempotent DEMO DATA seed

pnpm law:import:63fz -- --dry-run   # importer (always dry-run first)
pnpm law:monitor:63fz               # amendment monitoring, writes .import/ state/report
pnpm law:export:markdown            # deterministic Markdown export of current version
pnpm law:import:drafts -- --dry-run # stage non-public ai-assisted editorial drafts
```

CI (`.github/workflows/ci.yml`) runs: prisma:validate, typecheck, lint, security:audit,
prisma migrate deploy, test, db:ops:check, build. All must pass.

Prisma client generation is a prerequisite for typecheck/build; the `pretypecheck`/`postinstall`/
`build` scripts handle it, but if you see missing `@prisma/client` types, run `pnpm run prisma:generate`.

Tests do not require a database except the opt-in integration test
(`tests/reader-publication.integration.test.ts`), which skips itself when
`INTEGRATION_DATABASE_URL` is unset and destroys/recreates the `63fz` law when set — only point it
at a disposable database. The app itself falls back to clearly marked DEMO DATA when
`DATABASE_URL` is absent, so builds stay deterministic without a DB.

## Architecture

Two surfaces in one Next.js app:

- **Public reader** — `src/app/page.tsx` (server, `force-dynamic`) loads a cached snapshot via
  `getReaderData()` in `src/lib/law-data.ts`, narrows it to the requested view with
  `buildReaderView()` in `src/lib/reader-view.ts`, and renders `src/app/law-reader.tsx` (client
  component: version selector, tree navigation, change history, search, feedback buttons).
- **Admin CMS** — `src/app/admin/**`, invitation-only accounts with `admin` and `expert` roles.
  Pages and the export route resolve the caller with `getCurrentEditorialActor()` and redirect to
  `/admin/login`. Writes go through server actions (`actions.ts` files). **Every write endpoint
  must be auth-protected** (except the anonymous, rate-limited public change feedback in
  `src/app/feedback-actions.ts`).

### Data model (prisma/schema.prisma)

`Law` → `LawVersion` (multiple versions; `Law.currentVersionId` marks the current one) →
`LawFragment` tree (law/chapter/article/part/point/paragraph). The key concept is
**`stableId`**: fragments keep the same stable ID across versions (unique per
`[lawVersionId, stableId]`), which is what makes cross-version change history possible.
**Read `docs/STABLE-ID.md` before touching the importer's ID generation** — explanations and
feedback reference stableIds by string, and format changes silently corrupt history.

Editorial models attach to fragments: `PlainExplanation`, `ExpertComment`, `Issue`,
`ProposedRevision`. `FragmentChangeExplanation` is keyed by `(stableId, fromVersionId,
toVersionId)` — an explanation of one pairwise transition. `ChangeFeedback` stores anonymous
deduplicated feedback on transitions.

`EditorialUser` holds the invitation-only accounts (role `admin`/`expert`, active/disabled, scrypt
password hash) that authored content is attributed to; `EditorialAuditLog` records account,
session, contribution, and moderation events by identifier and status only, never passwords or
contribution text.

### Publication policy

Public visibility is gated by explicit status filters, centralized in:

- `src/lib/publication-policy.ts` — `PUBLIC_READER_STATUSES` (which editorial statuses are public:
  published explanations/comments, `confirmed` issues, `accepted` revisions).
- `src/lib/law-scope.ts` — `PUBLIC_LAW_SLUG` (`63fz`) and `PUBLIC_VERSION_STATUSES`
  (`published`/`archived`).

Never leak drafts or non-public statuses into reader queries; go through these constants.

### Editorial workflow

Explanations, comments, recommendations, and change explanations move through
`draft -> in_review -> published -> unpublished` (`src/lib/editorial-policy.ts`,
`src/lib/editorial-workflow.ts`). Editing a reviewed or published item resets it to `draft`. Only
the responsible expert may submit and publish, and publication requires explicit
factual/source/scope/version/responsibility confirmations. AI-assisted origin is permanent once
set and is never public before an expert publishes. Administrators moderate, unpublish, delete,
manage accounts, and download the export; experts may edit only rows attributed to them.

### Reader data flow and caching

`src/lib/law-data.ts` (~900 lines) is the core read path: it loads a version's fragment tree,
attaches published editorial blocks, and computes pairwise change history (`introduced` /
`changed` / `deleted`) between chronologically ordered versions (`src/lib/law-version-order.ts`,
`src/lib/change-history.ts`, diff snippets from `src/lib/text-diff.ts`).

`src/lib/reader-view.ts` sits between that snapshot and the page. Everything that decides what the
reader displays is in the URL — `mode`, `node`, `q`, `page`, and the `change*` filters — so
`parseReaderQuery()` reads it and `buildReaderView()` narrows the snapshot server-side, including
paging the feed at article boundaries. Keep filtering there rather than in the client component:
whatever the client receives is serialized into the page a second time as hydration props.

Reader links have a base-path trap that has bitten twice, in both directions: `router.push()` /
`router.replace()` take the **bare** pathname because Next prepends the base path itself, while a
raw `<a href>` must go through `buildReaderHref()` or it leaves the app. Tests in
`tests/reader-view.test.ts` guard both.

Results are cached in a `BoundedMemoryCache` (`src/lib/reader-cache.ts`) — a small in-process LRU,
not an HTTP/CDN cache. Cross-process invalidation works via a marker file
(`/tmp/63fz-legal-tech-reader-cache.invalidate`): the import script touches it, the server compares
its mtime on reads. If you add a write path that changes public reader content, invalidate this
cache.

### Auth

`src/lib/auth.ts`: HMAC-signed session cookie (scoped to `/63fz` path), in-memory login rate
limiting, 8h sessions. `getCurrentEditorialActor()` resolves the cookie to an actor — either the
bootstrap `env-admin` from `ADMIN_PASSWORD` or an active `EditorialUser` — and returns `null` for a
disabled account, so disabling takes effect on the next request. Authorization decisions go through
`src/lib/editorial-policy.ts`; check the actor's `role`, never merely that someone is signed in. `src/lib/auth-policy.ts` rejects example/short secrets at runtime —
`ADMIN_PASSWORD` ≥ 12 chars, `AUTH_SECRET` ≥ 32 chars, no "change-me" values. Copy `.env.example`
to `.env` for local work.

### Editorial drafts (content/editorial-drafts/)

Prepared plain-language explanations waiting for an expert. `pnpm law:import:drafts` loads them as
`PlainExplanation` rows with status `draft` and origin `ai_assisted`, both hardcoded — the script
cannot publish. Drafts are structural restatements of the official wording with no legal
interpretation; only a responsible expert may review and publish them. See that directory's README.

### Importer / monitoring scripts (scripts/)

`import-63fz.ts` parses source HTML into the fragment tree with stable IDs, verifies text
reconstruction against a checksum, and writes a report. Setting a new current version requires an
explicit confirmation flag and a database backup — never make this automatic. `monitor-63fz-amendments.ts`
checks the consolidated source for newer revisions and proposes a reviewable dry-run import command;
it deliberately never publishes anything itself. Both write state under `.import/`.

## Project rules (from README)

- Keep official law text strictly separate from explanations, comments, issues, and proposed
  revisions. **Never invent law text or expert comments.**
- Make small, reviewable commits per meaningful change.
- `docs/PLAN.md` is the roadmap (what's accepted/deferred/next); `docs/PROGRESS.md` is the
  chronological log. Update PROGRESS.md when completing meaningful steps.
- `docs/OPERATIONS.md` is the deploy/backup/migration runbook; `docs/STABLE-ID.md` is the fragment
  identity contract.
