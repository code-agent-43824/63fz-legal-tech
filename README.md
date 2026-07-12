# 63fz Legal Tech

Legal-tech reader and editorial CMS for structured work with Federal Law 63-FZ "On Electronic
Signature".

The current public placement is a test deployment under `/63fz`. It should not be treated as the
future permanent production domain.

## Current Status

- Imported real 63-FZ text with stable law fragments down to article, part, point, and paragraph
  level where the parser can identify them.
- Supports multiple law versions and a public version selector.
- Shows fragment change history across loaded versions, including `introduced`, `changed`, and
  `deleted` transitions.
- Includes an administrative editor for fragment commentary, proposed revisions, issues, and change
  explanations.
- Published change explanations and other editorial materials are filtered by explicit public
  statuses.
- Public reader data uses a normalized, bounded in-process published snapshot; this is not an
  HTTP/CDN cache.
- Public reader shows selected/current version status, effective date, source metadata, and clickable
  safe source links where available.
- Public reader has lightweight search across law text, public editorial blocks, and published
  change-history explanations.
- Change history supports URL filters, stable links to concrete changes, highlighted changed text,
  and anonymous feedback buttons.
- Amendment monitoring can check the consolidated source, persist check state/report files, and
  propose a reviewable dry-run import command.
- Admin-only Markdown export can produce a deterministic current-version Markdown file with public
  editorial material, published change rationale, source metadata, and accepted proposed revisions
  separated from official law text.
- Core reader and admin screens have a responsive overflow hardening pass for mobile widths.
- Residual correctness/security cleanup has tightened reader-cache keys, change-feedback validation,
  amendment source identity, standalone tracing, dependency audit status, and Prisma generation
  workflow.
- Article 18 has been used as the first editorial pilot for granular change explanations.

## Known Limitations

- The admin model is still a single password-protected account.
- Multi-user authentication, roles, and administrative audit logging are future work.
- Public reader optimization is intentionally pragmatic: the current page still renders the full
  selected reader view, while server queries and repeated public reads are now lighter.
- A separate "last checked for newer amendments" timestamp is not modeled yet; the reader currently
  shows source retrieval/check data from imported law versions.
- Search is a lightweight in-reader search over the loaded public snapshot, not a ranked full-text
  index.
- Change feedback is anonymous/aggregated v1 storage; there is no moderation dashboard or user
  account attribution yet.
- Mobile layout has had a first core overflow pass, but final visual polish should still be checked
  before a public launch.
- Amendment monitoring is a safe CLI workflow, not automatic publication. A new current version
  still requires reviewed dry-run output, database backup, and explicit current-version
  confirmation.
- Markdown export is protected/admin-only and intentionally limited to Markdown, not public bulk
  document generation.
- Public deployment is for testing the product shape, not a final domain or hosting commitment.
- Security advisories should be checked with `pnpm run security:audit`; do not treat security as
  permanently closed just because the current audit is clear.

## Development Principles

- Keep implementation simple and observable.
- Make small, reviewable commits for each meaningful change.
- Keep official law text separate from explanations, comments, issues, and proposed revisions.
- Do not invent law text or expert comments.
- Do not commit secrets, `.env` files, passwords, private keys, or tokens.
- Protect every write endpoint.
- Do not add hard dependencies on the current test domain or integrate with the main site unless that
  becomes a separate approved task.

## Local Commands

Install dependencies:

```bash
pnpm install --frozen-lockfile
```

Useful checks:

```bash
pnpm run prisma:generate
pnpm run prisma:validate
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
pnpm run security:audit
```

Importer:

```bash
pnpm law:import:63fz -- --dry-run
pnpm law:monitor:63fz
pnpm law:export:markdown
```

Prisma utilities:

```bash
pnpm run prisma:generate
pnpm run prisma:validate
pnpm run prisma:migrate
pnpm run prisma:seed
```

After pulling a schema change, `pnpm run typecheck` runs `prisma generate` first through
`pretypecheck`. Running `pnpm run prisma:generate` explicitly is still useful before focused Prisma
work or when diagnosing generated-client issues.

## Documentation

- [Development Roadmap](docs/PLAN.md)
- [Progress Log](docs/PROGRESS.md)
