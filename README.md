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
- Public reader data uses a cacheable published-data snapshot and no longer loads every law version
  with every fragment relation on each request.
- Article 18 has been used as the first editorial pilot for granular change explanations.

## Known Limitations

- The admin model is still a single password-protected account.
- Multi-user authentication, roles, and administrative audit logging are future work.
- Public reader optimization is intentionally pragmatic: the current page still renders the full
  selected reader view, while server queries and repeated public reads are now lighter.
- Mobile layout has a known horizontal overflow problem and needs a dedicated responsive pass.
- Automatic monitoring of new amendments and confirmed import of a new current version are planned
  but not implemented.
- Public deployment is for testing the product shape, not a final domain or hosting commitment.

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
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
```

Importer:

```bash
pnpm law:import:63fz -- --dry-run
```

Prisma utilities:

```bash
pnpm run prisma:generate
pnpm run prisma:validate
pnpm run prisma:migrate
pnpm run prisma:seed
```

## Documentation

- [Development Roadmap](docs/PLAN.md)
- [Progress Log](docs/PROGRESS.md)
