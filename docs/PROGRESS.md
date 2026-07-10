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
  - normalized law text SHA-256: `d2ff78b2b0d56f835238fd92dfd891fe247d24ca0fc09103f96b855d6cffa291`
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

## 2026-06-01. Detailed Fragment Import

- Refined `scripts/import-63fz.ts` to parse the current source into a hierarchy:
  - law preamble/root
  - articles
  - numbered parts
  - points
  - unnumbered paragraphs
- The importer now records parent stable IDs, preserves existing fragment rows through upsert where stable IDs match, and deletes only obsolete fragments for the imported version.
- Added dry-run verification that detailed fragments reconstruct exactly the same normalized law text as the article-level import.
- Updated the public reader to hide aggregate article rows when detailed child fragments exist, avoiding duplicated article text on the public page.

Verified dry-run from the recorded source:

- normalized law text SHA-256: `d2ff78b2b0d56f835238fd92dfd891fe247d24ca0fc09103f96b855d6cffa291`
- detailed reconstruction SHA-256: `d2ff78b2b0d56f835238fd92dfd891fe247d24ca0fc09103f96b855d6cffa291`
- detailed reconstruction matches normalized text: yes
- fragment count: 381
- article count: 29
- type counts: law 1, article 29, part 126, point 204, paragraph 21
- warnings: none

Verified locally:

- `pnpm law:import:63fz -- --source-file .import/63fz-current/source.html --dry-run`
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run build`

Production update:

- Backed up PostgreSQL before the detailed import:
  - `/home/openclaw/backups/63fz-legal-tech/20260601T094719Z/fz63_legal_tech_before_detailed_import.sql`
- Imported the detailed current version into production with the same normalized text checksum.
- Deployed standalone release `81689a6` to `/home/openclaw/services/63fz-legal-tech/releases/81689a6`.
- Restarted `63fz-legal-tech.service`.

Production verification:

- production DB has 381 fragments for `63fz-current-2025-07-31`
- production type counts: law 1, article 29, part 126, point 204, paragraph 21
- `sourceTextSha256` remains `d2ff78b2b0d56f835238fd92dfd891fe247d24ca0fc09103f96b855d6cffa291`
- sample order is correct: article 1 paragraph at 1001, article 2 paragraph at 2001, article 2 point 1 at 2002
- `https://mescheryakov.pro/63fz` returns HTTP 200, contains detailed fragment anchors, and does not contain `DEMO DATA`
- existing `https://mescheryakov.pro/` and `https://mescheryakov.pro/pdf-signing/` still return HTTP 200
- `63fz-legal-tech.service` is active with `NRestarts=0`

## 2026-06-01. Fragment Navigation And Admin Filters

- Reworked `/63fz/admin` for the detailed 381-fragment import:
  - article filter
  - fragment type filter
  - text/title/stableId search
  - article-grouped list instead of one long flat table
  - indentation by stable fragment depth
  - text snippets for faster editor scanning
- Added per-fragment metadata to admin list loading so the UI can search and group without a schema change.
- Made the public table of contents more compact:
  - sticky/scrollable desktop TOC
  - article-level entries link to the first visible detailed fragment
  - part entries are shown compactly
  - point-level entries are hidden from the TOC to avoid a 381-line navigation wall

Verified:

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run build`
- deployed standalone release `089051d`
- `63fz-legal-tech.service` is active with `NRestarts=0`
- `https://mescheryakov.pro/63fz` returns HTTP 200, keeps detailed anchors, has compact part labels, and does not contain `DEMO DATA`
- unauthenticated `https://mescheryakov.pro/63fz/admin` redirects to `/63fz/admin/login`
- existing root site and `/pdf-signing/` still return HTTP 200
- temporary published explanation on `63fz.article_2.point_1` appeared on the public page, then was deleted and verified absent

## 2026-06-01. Tree TOC And Reader Modes

- Replaced the flat public reader navigation with a client-side tree:
  - law root
  - articles
  - parts
  - points
  - paragraphs where present
- Added expand/collapse controls for the public table of contents.
- Added two public reading modes:
  - `Лента`: keeps the full law on one page and scrolls to the selected fragment.
  - `Фокус`: shows only the selected tree node and its descendants.
- Stores focus mode state in the URL through `mode=focus&node=...`, so focused views can be shared by link.
- Extended reader data with `stableId` and `parentStableId` metadata for fragments and TOC items without changing the database schema.

Verified locally:

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run build`
- local `next start` smoke check for `/63fz`, confirming the rendered page includes `Лента`, `Фокус`, `Раскрыть всё`, and the tree reader text.

Production update:

- Deployed standalone release `d21d42e`.
- `63fz-legal-tech.service` is active/running with `NRestarts=0`.
- `https://mescheryakov.pro/63fz` returns HTTP 200, includes the tree reader UI, keeps detailed fragment anchors, and does not contain `DEMO DATA`.
- Focus URL check passed for `https://mescheryakov.pro/63fz?mode=focus&node=63fz.article_2`.
- Browser automation check confirmed:
  - expanding article 2 reveals its child paragraph/point nodes
  - switching to focus mode updates the URL
  - selecting article 2 in focus mode renders only `63fz.article_2...` fragments
- Existing root site and `/pdf-signing/` still return HTTP 200.
- Unauthenticated `/63fz/admin` still redirects to `/63fz/admin/login`.

## 2026-06-11. Version Switcher And Safer TOC Controls

- Started the version-history layer without a schema migration; the existing `Law` and `LawVersion`
  models already support multiple law versions.
- Added a public version selector to the left reader panel.
- Demo versions are filtered out of the public version selector after the real law import.
- The reader can now load a requested version through the `version` URL parameter while preserving
  `mode` and `node`.
- Added fragment comparison against the current version:
  - unchanged fragments can reuse current-version commentary;
  - changed fragments are marked and do not inherit current commentary automatically;
  - fragments missing from the current version are marked as deleted in the current version.
- Added change summary counters for non-current selected versions.
- Reworked the public left panel controls:
  - version choice, reader mode, expand/collapse actions, and the tree are visually separated;
  - expand/collapse buttons have larger hit targets;
  - the expand/collapse button only toggles a branch;
  - the branch label only selects or scrolls to that fragment.
- Extended the importer so old revisions can be imported as separate versions:
  - `--version-id`
  - `--revision-date`
  - `--effective-date`
  - `--no-set-current`
- Dry-run reports now include a comparison summary against the current database version when
  `DATABASE_URL` is available.

Verified locally:

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run build`

Production deployment:

- Deployed commit `679a372` to `/home/openclaw/services/63fz-legal-tech/releases/679a372`.
- Candidate preflight on a temporary loopback port returned HTTP 200 for `/63fz`.
- Switched `/home/openclaw/services/63fz-legal-tech/current` to the new release and restarted the
  user service.

Production verification:

- `https://mescheryakov.pro/63fz` returns HTTP 200.
- unauthenticated `https://mescheryakov.pro/63fz/admin/changes?article=18` redirects to
  `/63fz/admin/login`.
- authenticated `/63fz/admin/changes?article=18` renders introduced/deleted labels, including
  `63fz.article_18.part_2.point_8`, and shows the empty "Было" side for an introduced fragment.
- public focus URL for `63fz.article_18.part_2.point_8` renders the introduced history label,
  default introduced-reason placeholder, and the introduced notarial power-of-attorney text.
- an older article 18 focus URL renders the new "Введено" summary count.
- `63fz-legal-tech.service` is active with `NRestarts=0`.

## 2026-07-08. 457-FZ Article 18 Granular Explanations

- Replaced the temporary aggregate article 18 draft for Federal Law No. 457-FZ with granular
  published explanations on the introduced fragments.
- Production backup before data writes:
  `/home/openclaw/backups/63fz-legal-tech/20260708T192410Z-before-457-granular-explanations/`.
- Added 3 `published` explanations for the 2023-08-15 to 2023-09-01 transition:
  - `63fz.article_18.part_1.point_ru4`: new identification data for a branch/representative
    office of a foreign legal entity;
  - `63fz.article_18.part_2.point_8`: notarized power of attorney for the head of such branch or
    representative office;
  - `63fz.article_18.part_2_2.point_4`: register extract from the state register of accredited
    branches and representative offices of foreign legal entities.
- Deleted the old draft aggregate record `manual-article18-457-article-20260708` on
  `63fz.article_18`.

Verified:

- article 18 explanations are now `published = 9`, with no article 18 drafts;
- all 3 public focus URLs render `введено`, Federal Law No. 457-FZ, and the official publication
  source link;
- authenticated `/63fz/admin/changes?article=18&q=457` finds exactly the granular stable IDs and
  no aggregate `63fz.article_18` record;
- `63fz-legal-tech.service` is active with `NRestarts=0`.

## 2026-07-08. Complete Article 18 Change Explanations

- Audited article 18 after introduced/deleted transition support was deployed.
- Remaining meaningful granular gaps:
  - `63fz.article_18.part_2.point_6`: 521-FZ technical renumbering of the foreign organization
    tax-registration item from lettered `б)` to numbered item `6)`;
  - `63fz.article_18.part_2.point_ru2`: the old lettered `б)` item removed from the current
    structure because the same requirement is now item `6)`;
  - `63fz.article_18.part_1.paragraph_1`: 94-FZ introduced the state body data item;
  - `63fz.article_18.part_1.point_3`: 94-FZ extended representative identification to state
    bodies from the article 8 part 6 list.
- Added 4 `published` explanations for those transitions.
- Production backup before data writes:
  `/home/openclaw/backups/63fz-legal-tech/20260708T195702Z-before-final-article18-explanations/`.
- Added commit `2047453` to hide aggregate article-level duplicates in `/63fz/admin/changes` when
  the same version pair has child transitions. This keeps article-level transitions available for
  true article-only changes, but removes noisy duplicates such as article 18.
- Deployed commit `2047453` to `/home/openclaw/services/63fz-legal-tech/releases/2047453`.

Verified:

- local `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build` passed before deploy;
- candidate preflight on a temporary loopback port returned HTTP 200 for `/63fz`;
- article 18 now has `published = 13` explanations and no drafts;
- authenticated `/63fz/admin/changes?article=18&status=missing` returns no transitions;
- authenticated article 18 admin search for `521` finds both `point_6` and `point_ru2`;
- public focus URLs for the 4 final granular transitions render the expected 521-FZ/94-FZ
  explanations;
- `https://mescheryakov.pro/63fz` returns HTTP 200;
- `63fz-legal-tech.service` is active with `NRestarts=0`;
- `/home/openclaw/services/63fz-legal-tech/current` points to release `2047453`.
- local production smoke check for `/63fz?mode=focus&node=63fz.article_1&version=test`, confirming
  the page renders the version selector, reader modes, and expand/collapse controls.
- importer dry-run against the saved current source HTML:
  - 381 fragments
  - detailed reconstruction SHA-256 matches the normalized law text SHA-256
  - warnings: none

Note:

- 2026-06-11 follow-up: imported the previous Контур.Норматив revision as a separate non-current
  version:
  - source URL: `https://normativ.kontur.ru/document?moduleId=1&documentId=501137`
  - version id: `63fz-revision-2025-04-21`
  - revision date: `2025-04-21`
  - effective date: `2025-09-01`
  - source HTML SHA-256: `94c2226875581f9559c03e44492cb35f9abb5d87ff55a291829566ec356f24a7`
  - normalized text SHA-256: `71ad9c2c760cf159b6c84c71ce981eab5cbe0f1e90a860fa8be0113129ac9274`
  - fragment count: 381
  - comparison with current: unchanged 375, changed 6, added 0, deleted 0
  - warnings: none
- Backup before production write:
  `/home/openclaw/backups/63fz-legal-tech/20260611T135349Z-before-previous-version-import/fz63_legal_tech_before_previous_version.sql`
- Current version remained `63fz-current-2025-07-31`.
- Public verification after import:
  - version selector shows both real revisions and no `DEMO DATA`;
  - `https://mescheryakov.pro/63fz?version=63fz-revision-2025-04-21` renders the previous revision;
  - visible reader fragments show `без изменений` and `изменено` badges;
  - `63fz-legal-tech.service` did not need a restart for this data-only import.

## 2026-06-11. Fragment Change History Placeholders

- Added computed per-fragment change history across all loaded non-demo law versions.
- The history layer uses stable fragment IDs and compares consecutive version texts in effective-date order.
- For changed transitions, the reader now shows:
  - the previous and new revision labels;
  - short `Было` / `Стало` snippets around the first changed text area;
  - a placeholder for the reason of the change;
  - a placeholder for the purpose and practical meaning of the change.
- Unchanged transitions are not rendered per fragment to keep the 381-fragment feed readable.
- No schema migration was added yet; editor-written change rationale can be modeled later once the
  placeholder wording and workflow are validated.

Verified:

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run build`

## 2026-06-24. Four More Historical Revisions

- Imported four additional Контур.Норматив states as separate non-current `LawVersion` rows:
  - `documentId=485991`, revision `2024-12-28`, effective `2025-01-08`,
    version `63fz-revision-2024-12-28-effective-2025-01-08`, 379 fragments,
    normalized text SHA-256 `c5528c147197e9a5de9a46df3c5b31e916a8fed890a5a8c8c5c0c70fb5b2f62a`;
  - `documentId=474287`, revision `2023-08-04`, effective `2024-08-05`,
    version `63fz-revision-2023-08-04-effective-2024-08-05`, 379 fragments,
    normalized text SHA-256 `bb495144518210ef81a7507d6e5b12c0196884a819c0afb25318bd3ac1daeaea`;
  - `documentId=455153`, revision `2023-08-04`, effective `2023-09-01`,
    version `63fz-revision-2023-08-04-effective-2023-09-01`, 377 fragments,
    normalized text SHA-256 `0ed3a40fe1317122d696bb59d030c6cf3ef759e59480da60d7983f5b4d847064`;
  - `documentId=453947`, revision `2023-08-04`, effective `2023-08-15`,
    version `63fz-revision-2023-08-04-effective-2023-08-15`, 372 fragments,
    normalized text SHA-256 `fec8e4db4ecffd9d695a1e10ebdf54d6e7aac0e4da9d455907503d69553b9e0e`.
- Versions sharing the same revision date use the effective date in their IDs to avoid collisions.
- Fixed importer normalization so HTML entities such as `&quot;` are decoded before checksumming,
  storage, and comparison. Also accepted both `Д. МЕДВЕДЕВ` and `Д.МЕДВЕДЕВ` source formatting in
  the final-signature validation.
- Re-imported the current and already loaded previous revision through the same normalized parser,
  preserving fragment IDs and attached commentary:
  - current text SHA-256:
    `0141476474ffc4249e018aecc61b6c54d9cda64930b8d93bb07e411b97aa646b`;
  - previous `2025-04-21` text SHA-256:
    `779f1c823fd9607d99a0d1d85381a058bc712ca990f148fb21321bf6a0494b6e`.
- Comparison against the normalized current version:
  - effective `2025-01-08`: unchanged 358, changed 21, added 0, deleted 2;
  - effective `2024-08-05`: unchanged 349, changed 29, added 1, deleted 3;
  - effective `2023-09-01`: unchanged 345, changed 31, added 1, deleted 5;
  - effective `2023-08-15`: unchanged 326, changed 45, added 1, deleted 10.
- Production backup before writes:
  `/home/openclaw/backups/63fz-legal-tech/20260624T204857Z-before-four-older-revisions/`.
- Production now contains six real versions; `currentVersionId` remains
  `63fz-current-2025-07-31`.
- Multi-transition history is now exercised by real data. For example, `63fz.article_18` has three
  changed transitions across the imported chronology.

Verified:

- every dry run and write reconstructed the normalized full text exactly and reported no warnings;
- no duplicate version IDs or duplicate `(lawVersionId, stableId)` rows were created;
- existing commentary counts remained unchanged;
- public selector shows all six real states with both revision and effective dates;
- oldest focus URL returns HTTP 200 and renders history blocks and explanation placeholders;
- `/63fz`, `/`, and `/pdf-signing/` return HTTP 200;
- unauthenticated `/63fz/admin` redirects to `/63fz/admin/login`;
- public HTML contains no `DEMO DATA` and no encoded `&quot;` comparison artifacts;
- `63fz-legal-tech.service` is active with `NRestarts=0`.

## 2026-06-29. Change Explanation Storage And Admin Editor

- Added `FragmentChangeExplanation` storage for editorial notes about a concrete fragment transition:
  - `stableId`;
  - `fromVersionId`;
  - `toVersionId`;
  - reason, purpose, practical meaning, source links;
  - draft/published status.
- The unique key is `(stableId, fromVersionId, toVersionId)`, so notes survive fragment row
  replacement during future re-imports as long as stable IDs and law version IDs remain unchanged.
- Added protected `/63fz/admin/changes`:
  - filters by article, status, and search query;
  - lists only real changed transitions computed from loaded law versions;
  - shows `Было` / `Стало` snippets;
  - lets an admin create, update, publish, draft, or delete the explanation for a transition.
- Public fragment history now renders published saved fields instead of placeholders and keeps
  placeholders only for empty fields.

Verified locally:

- `pnpm prisma format`
- `pnpm prisma generate`
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run build`

Next safe step: apply the new migration on production, deploy the release, and verify the admin
change editor plus public rendering against the live database.

Production deployment:

- Commit `ef71020` deployed to `/home/openclaw/services/63fz-legal-tech/releases/ef71020`.
- Production database backup before migration:
  `/home/openclaw/backups/63fz-legal-tech/20260629T083731Z-before-change-explanations/fz63_legal_tech_before_change_explanations.sql`
- Applied the migration on production. The app role created the table and indexes; PostgreSQL owner
  added the two `LawVersion` foreign keys because the app role does not own `LawVersion`.
- Switched `/home/openclaw/services/63fz-legal-tech/current` to the new release and restarted the
  user service.

Production verification:

- `https://mescheryakov.pro/63fz` returns HTTP 200.
- unauthenticated `https://mescheryakov.pro/63fz/admin` redirects to `/63fz/admin/login`.
- authenticated `https://mescheryakov.pro/63fz/admin/changes?article=18` returns HTTP 200 and
  contains the new history editor markers.
- `https://mescheryakov.pro/63fz?mode=focus&node=63fz.article_18` returns HTTP 200 and renders the
  public change-history fields.
- `FragmentChangeExplanation` exists and initially contains 0 rows.
- `63fz-legal-tech.service` is active/running with `NRestarts=0`.

## 2026-07-08. Article 18 Change Explanation Pilot

- Filled the first production `FragmentChangeExplanation` records for article 18.
- Production backup before data writes:
  `/home/openclaw/backups/63fz-legal-tech/20260708T060014Z-before-article18-explanations/`.
- Researched and linked the changing laws:
  - Federal Law No. 457-FZ of 2023-08-04: foreign legal entity branch/representative office
    certificate data and verification materials;
  - Federal Law No. 521-FZ of 2024-12-28: replacement of 149-FZ biometric references with the
    special 572-FZ biometric identification framework;
  - Federal Law No. 94-FZ of 2025-04-21: qualified certificates for state bodies listed in the new
    article 8 part 6 information resource.
- Wrote 7 article 18 explanation records:
  - 6 `published` granular records:
    - `63fz.article_18.part_1.point_1` for the 521-FZ biometric reference update;
    - `63fz.article_18.part_1.point_3` for the 521-FZ representative identification update;
    - `63fz.article_18.part_1.point_4` for the 521-FZ cryptographic tools reference update;
    - `63fz.article_18.part_1.point_2` for the 94-FZ state body applicant update;
    - `63fz.article_18.part_1_1.point_2` for the 94-FZ verification resource update;
    - `63fz.article_18.part_3` for the 94-FZ "под расписку или" clarification.
  - 1 `draft` aggregate record on `63fz.article_18` for the 457-FZ change.
- Pilot finding: the current change editor shows the 457-FZ additions only as a changed aggregate
  `article` transition. The newly introduced nested items are not represented as first-class
  "introduced fragment" transitions, so the public reader does not have a good place to show that
  explanation yet.

Verified:

- article 18 explanation count is now `draft = 1`, `published = 6`;
- public focus URL for `63fz.article_18.part_1.point_1` renders the 521-FZ explanation and source
  text, while the 457-FZ draft is not exposed publicly;
- public focus URL for `63fz.article_18.part_3` renders the 94-FZ explanation and source link;
- unauthenticated `/63fz/admin/changes?article=18` still redirects to `/63fz/admin/login`;
- `/63fz` returns HTTP 200;
- `63fz-legal-tech.service` is active with `NRestarts=0`.

Next safe step: add explicit support for introduced/deleted fragment transitions in the change
history model before trying to publish the 457-FZ article 18 explanation.

## 2026-07-08. Introduced And Deleted Change Transitions

- Added computed change transition types for neighboring law versions:
  - `changed` when a stable fragment exists in both versions and normalized text differs;
  - `introduced` when a stable fragment appears in the newer version;
  - `deleted` when a stable fragment disappears in the newer version.
- No database migration was needed. Existing `FragmentChangeExplanation` keys already use
  `stableId + fromVersionId + toVersionId`, which also identifies introduced and deleted
  transitions.
- Updated `/63fz/admin/changes` to label transition type and show empty-side snippets for
  introduced/deleted fragments.
- Updated the public reader history to render introduced/deleted badges and appropriate
  placeholders for reason, purpose, and practical meaning.
- Added an "Введено" count to the non-current version comparison summary.

Verified locally:

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run build`

## 2026-07-10. Security Hardening

- Implemented the first security hardening stage while keeping the current single administrative
  account model.
- Removed the unsafe `AUTH_SECRET` fallback for session signing. Admin session signing now fails
  closed when `AUTH_SECRET` is missing, example-valued, or shorter than the configured minimum.
- Added stronger `ADMIN_PASSWORD` checks: missing, example-valued, and too-short passwords are
  rejected before login can succeed.
- Added in-memory admin login rate limiting for the standalone Node process.
- Added an admin logout server action and visible logout buttons in the admin fragment list,
  fragment editor, and change editor.
- Tightened admin session cookie settings to `httpOnly`, `secure` in production, `sameSite:
  strict`, `/63fz` path, and eight-hour lifetime. Logout clears the cookie on the same path.
- Added basic security headers in `next.config.ts` and disabled `X-Powered-By`.
- Hardened public reader status filtering:
  - plain explanations: `published`;
  - expert comments: `published`;
  - issues: `confirmed`;
  - proposed revisions: `accepted`;
  - change explanations were already filtered to `published`.
- Added server-side validation for admin form enum values, record IDs, stable IDs, field length
  limits, and `https://`-only source-link protocols.
- Added required delete confirmations for fragment editorial records and change explanations.
- Updated `docs/PLAN.md` to mark the single-admin-account security hardening pass complete.
- Code commit: `7c01eab` (`feat: harden admin security`).

Verified locally:

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run build`

Production deployment:

- Verified production secret shape without printing secret values: `ADMIN_PASSWORD` and
  `AUTH_SECRET` are present, long enough, and not example-like.
- Deployed release `7c01eab` to
  `/home/openclaw/services/63fz-legal-tech/releases/7c01eab`.
- Candidate preflight on `127.0.0.1:3911` returned HTTP 200 for `/63fz`; `/63fz/admin/login`
  returned the expected security headers and no `X-Powered-By` header.
- Switched `/home/openclaw/services/63fz-legal-tech/current` to release `7c01eab` and restarted
  `63fz-legal-tech.service`.

Production verification:

- `https://mescheryakov.pro/63fz` returns HTTP 200.
- unauthenticated `https://mescheryakov.pro/63fz/admin` redirects to `/63fz/admin/login`.
- `https://mescheryakov.pro/63fz/admin/login` returns the configured security headers and no
  `X-Powered-By` header.
- authenticated `/63fz/admin` returns HTTP 200 and renders the logout control plus admin navigation.
- `63fz-legal-tech.service` is active with `NRestarts=0`.

## 2026-07-10. Lightweight Tests And CI

- Implemented the lightweight testing and CI stage without adding a heavy browser or PostgreSQL
  test dependency.
- Added `pnpm test` using Node's built-in test runner through `tsx --test`.
- Added `pnpm run prisma:validate` with a dummy `DATABASE_URL`, so schema validation does not need
  a running database.
- Added pure policy/helper modules to make critical behavior easy to test:
  - `src/lib/change-history.ts` for `introduced` / `changed` / `deleted` classification;
  - `src/lib/auth-policy.ts` for admin secret validation;
  - `src/lib/publication-policy.ts` for public reader status rules.
- Refactored existing runtime code to use those helpers without changing the public route shape.
- Exported importer parsing/reconstruction helpers behind a safe direct-run guard so tests can load
  them without running the importer CLI.
- Added 13 fast tests:
  - change-transition classification and whitespace normalization;
  - auth-secret and admin-password policy;
  - public status policy excluding draft/internal states;
  - importer fixture/golden test for stable IDs and reconstruction;
  - no-database smoke fallbacks for public reader and admin fragments.
- Added `.github/workflows/ci.yml` for pushes and pull requests:
  - install with frozen lockfile;
  - Prisma schema validation;
  - typecheck;
  - lint;
  - fast tests;
  - production build.
- Added `packageManager: pnpm@11.5.0` and fixed the workflow setup order so pnpm is installed
  before setup-node enables pnpm caching.
- Updated `README.md` and `docs/PLAN.md` to reflect the now-available test command and completed
  lightweight CI stage.
- Code/test commit: `3c3fb60` (`test: add lightweight ci checks`).
- CI workflow fix commit: `83013c3` (`ci: install pnpm before node cache`).

Verified locally:

- `pnpm install --frozen-lockfile`
- `pnpm run prisma:validate`
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test` (`13` tests passed)
- `pnpm run build`

CI verification:

- GitHub Actions run `29086993264` completed successfully on `master` with install, Prisma
  validation, typecheck, lint, fast tests, and production build.

Production deployment:

- Deployed runtime release `3c3fb60` to
  `/home/openclaw/services/63fz-legal-tech/releases/3c3fb60`.
- Candidate preflight on `127.0.0.1:3912` returned HTTP 200 for `/63fz`; `/63fz/admin/login`
  returned the expected security headers and no `X-Powered-By` header.
- Switched `/home/openclaw/services/63fz-legal-tech/current` to release `3c3fb60` and restarted
  `63fz-legal-tech.service`.

Production verification:

- `https://mescheryakov.pro/63fz` returns HTTP 200 and contains the expected public marker.
- unauthenticated `https://mescheryakov.pro/63fz/admin` redirects to `/63fz/admin/login`.
- `https://mescheryakov.pro/63fz/admin/login` returns security headers and no `X-Powered-By`.
- `63fz-legal-tech.service` is active with `NRestarts=0`.

## 2026-07-10. Hide Empty Editorial Sections

- Implemented the public reader cleanup for empty editorial sections.
- Public reader data now returns only editorial blocks with real public content:
  - plain-language explanations only when published rows exist;
  - expert comments only when published rows exist;
  - issue/dispute blocks only when confirmed rows exist;
  - proposed revisions only when an accepted row exists.
- Removed generated "Пока не добавлено" / "Пояснение пока не добавлено" placeholder cards from
  both database-backed reader data and the no-database demo fallback.
- The reader now shows one selected-scope empty state only when the visible selection has no
  supplemental content at all.
- Fragments without change history, commentary notices, or editorial blocks render as a single-column
  law-text row instead of an empty right-hand commentary column.
- Kept change-history rendering intact, so article 18 change explanations still have a right-hand
  side panel where relevant.
- Updated `docs/PLAN.md` to mark the empty editorial sections stage complete.
- Added a smoke assertion that no-database reader fallback returns no placeholder editorial blocks.
- Code commit: `5460da4` (`feat: hide empty editorial sections`).

Verified locally:

- `pnpm run prisma:validate`
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test` (`13` tests passed)
- `pnpm run build`

CI verification:

- GitHub Actions run `29095838836` completed successfully on `master`.

Production deployment:

- Deployed release `5460da4` to
  `/home/openclaw/services/63fz-legal-tech/releases/5460da4`.
- Candidate preflight on `127.0.0.1:3913` returned HTTP 200 for `/63fz`; `/63fz/admin/login`
  returned expected security headers and no `X-Powered-By`; public HTML did not contain
  "Пока не добавлено".
- Switched `/home/openclaw/services/63fz-legal-tech/current` to release `5460da4` and restarted
  `63fz-legal-tech.service`.

Production verification:

- `https://mescheryakov.pro/63fz` returns HTTP 200 and contains the expected public marker.
- public HTML no longer contains "Пока не добавлено".
- unauthenticated `https://mescheryakov.pro/63fz/admin` redirects to `/63fz/admin/login`.
- `https://mescheryakov.pro/63fz/admin/login` returns security headers and no `X-Powered-By`.
- `63fz-legal-tech.service` is active with `NRestarts=0`.
