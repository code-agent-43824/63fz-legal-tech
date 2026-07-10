# Development Roadmap

This roadmap replaces the original linear MVP checklist. Completed work is kept as a short history,
while active planning is organized by priority, dependency, status, and acceptance criteria.

## Current Product Baseline

Status: test public deployment.

- The project is a Next.js/TypeScript/Prisma application for structured reading of Federal Law
  63-FZ "On Electronic Signature".
- The database contains the imported law text with detailed stable fragments and several real law
  versions.
- The public reader supports a version selector, tree navigation, focus/feed modes, and fragment
  change history with `introduced`, `changed`, and `deleted` transition types.
- The admin area uses one password-protected administrative account and can edit fragment
  commentary, proposed revisions, issues, and change explanations.
- Public reader data is filtered to public statuses, hides empty editorial sections, and uses a
  cacheable snapshot for published reader data.
- Article 18 has a completed editorial pilot for change explanations.
- The current public placement under `/63fz` is a test placement. Do not treat the current host name
  or path as the future permanent product domain.

## Completed History

These milestones are done and should remain historical context, not the shape of the active roadmap.

- Environment reconnaissance and isolated `/63fz` deployment approach.
- Next.js application skeleton with `basePath: "/63fz"`.
- Prisma schema, migrations, and PostgreSQL-backed deployment.
- Public reader, stable fragment anchors, tree table of contents, and focus/feed modes.
- Password-protected admin shell and fragment edit forms.
- Verified import pipeline for the current 63-FZ text.
- Detailed fragmentation into law, articles, parts, points, and paragraphs.
- Multiple real law versions and version-aware reader behavior.
- Computed change history for `introduced`, `changed`, and `deleted` transitions.
- `FragmentChangeExplanation` storage, admin editor, and public rendering for published change
  explanations.
- Article 18 editorial pilot and aggregate-duplicate filtering.
- Single-admin security hardening: secret validation, login rate limiting, logout, cookie hardening,
  security headers, public-status filtering, server-side validation, and delete confirmations.
- Lightweight test and CI baseline with fast Node tests, Prisma schema validation, typecheck, lint,
  and production build.
- Empty public editorial sections hidden from the reader.
- Public reader query optimization and cacheable published-data snapshot.
- Public freshness and source metadata in the reader.
- Lightweight public search across loaded reader data.

See `docs/PROGRESS.md` for the chronological implementation log. Do not rewrite that log
retroactively.

## Roadmap Order

1. Security Hardening.
2. Lightweight Tests And CI.
3. Hide Empty Editorial Sections.
4. Reader Query Optimization And Cacheable Snapshot.
5. Public Freshness And Source Metadata.
6. Search Across Law Text And Change History.
7. Improved Diff View, Filters, Permalinks, And Feedback.
8. Amendment Monitoring And Confirmed Import.
9. Markdown Export.
10. Deferred Mobile Responsive Rework.
11. Multi-User Authentication, Roles, And Audit.

Security comes first because later work will expand public and administrative surfaces. Tests and CI
come next so subsequent changes have cheap regression coverage. Query optimization should happen
before search and richer history screens, because those features will otherwise amplify the current
"load everything" reader pattern.

Preparing for a future domain move is tracked as a future infrastructure task, but it does not move
public search, change-history work, amendment monitoring, or Markdown export down the product order.

## Near-Term Required Work

### 1. Security Hardening

Priority: P0.
Status: completed for the single-admin-account hardening pass.

Goal:

- Make the current single-admin-account model safer before adding more public features.

Tasks:

- Remove the unsafe production fallback for `AUTH_SECRET`.
- Fail closed when required production secrets are missing, example-valued, or too weak.
- Define and enforce minimum length and quality checks for `AUTH_SECRET` and `ADMIN_PASSWORD`.
- Ensure draft proposed revisions are never shown publicly.
- Publicly expose only statuses that are explicitly allowed for publication.
- Add rate limiting for admin login attempts.
- Add an administrative logout flow that reliably clears the session.
- Review session cookie attributes: `httpOnly`, `secure`, `sameSite`, `path`, lifetime, and deletion
  behavior under the `/63fz` base path.
- Add basic security headers.
- Disable unnecessary technology disclosure headers, including `X-Powered-By` where applicable.
- Add server-side validation for enum values, stable IDs, version IDs, URLs, and field length limits.
- Add confirmation for destructive admin actions such as delete operations.
- Record a future task for real multi-user authentication with roles and an action audit log.

Dependencies:

- Existing `src/lib/auth.ts` single-admin cookie flow.
- Existing Prisma enums and admin server actions.
- No user/role migration is required for this stage unless a small support table is needed for rate
  limiting.

Acceptance criteria:

- In production mode, the app refuses to start or refuses protected auth operations when
  `AUTH_SECRET` or `ADMIN_PASSWORD` is missing, example-valued, or below the documented minimum.
- There is no code path that signs an admin session with a development-only fallback secret in
  production.
- Public reader data excludes `draft` proposed revisions and any other non-public statuses.
- Login attempts are rate-limited by a practical key such as IP plus username/scope, with clear
  behavior for temporary lockouts.
- Admin has a visible logout action and the session is invalid after logout.
- Cookie settings are documented and verified in production-like mode.
- Basic security headers are present on public and admin responses; framework technology headers are
  not unnecessarily exposed.
- Invalid enum values, IDs, URLs, oversized fields, and malformed source links are rejected on the
  server.
- Delete/destructive actions require explicit confirmation in the UI.
- `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build` pass.

Explicitly not included:

- Full user accounts, OAuth, SSO, role management, or audit logs.
- A public registration flow.
- Broad redesign of admin screens.

Implementation note:

- The current pass keeps the single administrative account but removes the unsafe auth-secret
  fallback, adds fail-closed secret checks, login rate limiting, logout, stricter cookie settings,
  basic security headers, public status filtering, server-side form validation, URL protocol
  validation for source links, and delete confirmations.

### 2. Lightweight Tests And CI

Priority: P0.
Status: completed for the lightweight fast-check pass.

Goal:

- Add cheap regression coverage without creating a heavy local test environment.

Tasks:

- Add unit tests for law-version comparison and transition classification:
  `introduced`, `changed`, `deleted`, and unchanged.
- Add fixture/golden tests for critical importer behavior, including stable IDs and reconstruction
  checksums.
- Add a test that draft editorial materials do not appear in public reader data.
- Add a test for authentication behavior when `AUTH_SECRET` is missing, example-valued, or invalid
  for production.
- Add a few smoke tests for key pages.
- Add one minimal responsive test that either documents the known mobile overflow or prevents further
  regression.
- Add a lightweight Prisma schema/migration validation step that does not require a permanently
  running heavy local environment.
- Add CI that runs only:
  - install with frozen lockfile;
  - typecheck;
  - lint;
  - fast tests;
  - production build.

Dependencies:

- Security hardening should define the expected auth failure behavior before auth tests are finalized.
- A test runner must be selected and added to `package.json`.

Acceptance criteria:

- `pnpm test` exists and runs the fast suite locally without requiring a long-lived PostgreSQL
  service.
- CI uses `pnpm install --frozen-lockfile`.
- CI completes the minimum checks without running optional PostgreSQL integration tests.
- Importer fixture tests can run from local fixture files and do not fetch remote legal sources.
- The responsive test is explicit about whether it is a known-issue guard or a no-regression guard.
- PostgreSQL integration tests, if added, can be run separately or on demand.

Explicitly not included:

- Heavy browser matrices.
- Mandatory PostgreSQL integration tests on every short local development cycle.
- Load testing.
- Large end-to-end suites that make ordinary edits slow.

Implementation note:

- The current pass uses Node's built-in test runner through `tsx --test`, without adding a heavy
  browser or database dependency. Coverage includes change-transition classification, auth-secret
  policy, public publication-status policy, importer fixture/golden behavior, and no-database smoke
  fallbacks. CI runs install with frozen lockfile, Prisma schema validation with a dummy
  `DATABASE_URL`, typecheck, lint, fast tests, and production build.

### 3. Hide Empty Editorial Sections

Priority: P1.
Status: completed.

Goal:

- Reduce public reader noise by hiding empty editorial blocks and repeated placeholders.

Tasks:

- Do not render fully empty editorial sections.
- Remove repeated "Пока не добавлено" blocks from every fragment.
- Hide empty blocks for:
  - "Простыми словами";
  - "Комментарии экспертов";
  - "Ошибки и спорные места";
  - "Предложенная редакция".
- Show one explanatory empty state at page level or selected-fragment level only when useful.
- Check public visibility rules for each status separately.

Dependencies:

- Security hardening status-publication rules.
- Existing reader block model in `src/lib/law-data.ts` and `src/app/law-reader.tsx`.

Acceptance criteria:

- A fragment with no published editorial material shows the official text without four repeated empty
  cards.
- A page or focused fragment may show one concise empty state when it helps orientation.
- Draft and otherwise non-public materials remain absent from public output.
- Existing published article 18 change explanations still render.
- `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build` pass.

Explicitly not included:

- Rewriting editorial copy.
- Adding new editorial data models.
- Mobile layout fixes.

Implementation note:

- Public reader data now includes only editorial blocks that have real public content. Empty
  "Простыми словами", "Комментарии экспертов", "Ошибки и спорные места", and "Предложенная
  редакция" cards are not generated. The reader shows one selected-scope empty state when no
  editorial blocks are available at all, and fragments without any side content render as a
  single-column law-text row.

### 4. Reader Query Optimization And Cacheable Snapshot

Priority: P1.
Status: completed for the current full-reader screen.

Goal:

- Stop loading all law versions, all fragments, and all related materials for every public reader
  request.

Tasks:

- Measure current HTML/RSC payload size, TTFB, and rendered DOM element count before changing the
  data-loading strategy.
- Load only the selected version and current version, or another minimal data set needed for the
  current screen.
- Separate data access for table of contents, selected fragment/subtree, and change history.
- Choose server pagination, selective loading, or another approach that avoids sending the whole law
  to the client unnecessarily.
- Build a cacheable snapshot of published public data.
- Invalidate the snapshot after publishing editorial material or importing a new law version.
- Ensure admin pages are never served from the public snapshot cache.
- Define behavior for temporary database unavailability.
- Measure the same baseline metrics after the change and document the comparison.

Dependencies:

- Security/publication-status filtering.
- Hidden empty sections should reduce payload noise first.
- Existing `LawVersion.source*` fields and change explanation data.

Acceptance criteria:

- Baseline metrics are recorded before optimization.
- Public reader requests no longer fetch every version with every fragment and every relation by
  default.
- The current screen has the data it needs for the selected mode without exposing non-public rows.
- Published data snapshot generation and invalidation are explicit and testable.
- Admin routes bypass public snapshot caching.
- A temporary database failure produces a controlled response instead of a broken partial page.
- Post-change metrics are recorded; no arbitrary hard performance target is claimed before the
  baseline exists.

Explicitly not included:

- Search indexing.
- CDN or domain migration.
- Admin query optimization except where needed to avoid cache misuse.

Implementation note:

- Baseline before this pass: production `/63fz` returned `1,334,284` bytes, about `3,307` HTML tags,
  and TTFB around `1.00-1.11s` on repeated uncached reads after the empty-section cleanup.
- The reader now loads version metadata first, then only the selected version fragments, the current
  version fragments when needed for comparison, and minimal history fragments for stable IDs visible
  in the selected screen.
- Published public reader data is cached in process and keyed by selected version plus an explicit
  marker file. Admin writes and law imports invalidate the marker; admin pages do not read from this
  public snapshot cache.
- If the database is temporarily unavailable after a successful public read, the reader can continue
  serving the last in-process snapshot for that selected version.
- Post-change production measurements kept the same HTML size for the full reader screen, as
  expected, but warmed public reads improved TTFB to roughly `0.26-0.37s`.

## Next Product Stage

### 5. Public Freshness And Source Metadata

Priority: P1.
Status: completed for imported version metadata.

Goal:

- Make the reader trustworthy by showing the date, source, and editorial boundary around legal data.

Tasks:

- Show which law version is current.
- Show the effective date of the selected version.
- Show the last freshness-check date when available.
- Show source name and source link for the selected law version.
- Make change-history sources clickable.
- Validate allowed source-link protocols, for example `https:` only unless another protocol is
  explicitly approved.
- Show source and date near legally significant data.
- Prefer official publication where possible, or explicitly mark when a non-official consolidated
  source was used and how it was verified.
- Visually and textually separate official law text from editorial explanations.

Dependencies:

- Existing `LawVersion.effectiveDate`, `sourceUrl`, `sourceName`, `sourceRetrievedAt`,
  `sourceHtmlSha256`, and `sourceTextSha256` fields.
- Security hardening URL validation.

Acceptance criteria:

- Reader UI shows selected/current version, effective date, source name, and source link when stored.
- Change explanation source links render as safe clickable links, not raw unvalidated text.
- Missing source metadata has a clear fallback state.
- Official text and editorial commentary are visually distinct.
- If "last checked" cannot be derived from existing fields, the plan for the minimal model addition
  is documented before migration.

Minimal model change if needed:

- Prefer using existing `sourceRetrievedAt` for source retrieval.
- Add a small freshness field only if the product needs a separate "last checked for newer
  amendments" timestamp that differs from source retrieval.

Explicitly not included:

- Automatic amendment monitoring.
- Automatic legal-text publication.
- Domain migration.

Implementation note:

- The reader now shows whether the selected version is current or historical, its effective date,
  source name/link, and `sourceRetrievedAt` as the current source-check timestamp.
- The current law source is displayed as a consolidated source when it comes from `Контур.Норматив`;
  official publication links remain attached to change explanations where those editorial cards
  include official source URLs.
- Change explanation source text is parsed into deduplicated safe `https:` links before rendering.
  Raw unvalidated source text is not printed as a public link block.
- Official law text is marked separately from editorial side panels in the reader.
- No migration was added in this pass. A distinct "last checked for newer amendments" field remains
  part of the future amendment-monitoring/import stage if it needs to differ from source retrieval.

### 6. Search Across Law Text And Change History

Priority: P2.
Status: completed for lightweight in-reader search.

Goal:

- Let readers find law fragments and amendment explanations without scanning the tree manually.

Tasks:

- Search original law text.
- Search published plain-language explanations and expert comments.
- Search published change explanations and source labels.
- Link every result to the exact fragment or concrete change.
- Put public search before Markdown export in delivery order.

Dependencies:

- Query optimization and public snapshot strategy.
- Publication-status filtering.

Acceptance criteria:

- Search results only include public, published material.
- Results link to stable fragment URLs or change permalinks.
- Search works for current and selected historical versions where supported.
- Empty and no-result states are concise.
- Baseline query behavior is measured before adding heavier indexing.

Explicitly not included:

- Full-text ranking perfection.
- External search service unless a local database approach proves insufficient.
- Markdown export.

Implementation note:

- Public search is implemented inside the reader over the already-loaded public snapshot. This keeps
  the stage lightweight and avoids a separate search index.
- The search covers original law text, stable IDs/titles, public editorial blocks, published change
  explanations, and safe source-link labels/URLs that are already present in `ReaderData`.
- The query is stored in the `q` URL parameter. Results link to `mode=focus&node=<stableId>` plus the
  fragment anchor, preserving the selected law version.
- Results are capped and intentionally simple. Ranking, dedicated database full-text search, change
  permalinks, filters, and advanced diff search remain in the next roadmap stage.

### 7. Improved Diff View, Filters, Permalinks, And Feedback

Priority: P2.
Status: planned.

Goal:

- Make change history easier to inspect, cite, filter, and improve.

Minimum implementation:

- Improve the "Было / Стало" presentation.
- Highlight the directly changed text range, not only broad context snippets.
- Add search and filters by:
  - article;
  - version pair;
  - change type;
  - explanation status;
  - source presence.
- Add a permanent link to a concrete change.
- Encode the stable fragment ID plus from/to version pair in that link.
- Remove irrelevant empty blocks from change screens.
- Add simple feedback:
  - "Полезно";
  - "Непонятно";
  - "Ошибка".
- Add basic anti-spam protection for feedback.
- Store anonymous or aggregated feedback first; user accounts are not required for v1.

Dependencies:

- Search and optimized change-history data access.
- Security validation for IDs, enum filters, and URL parameters.
- Optional minimal feedback storage model.

Acceptance criteria:

- A concrete change can be opened directly by URL and remains stable across page refreshes.
- Filters can isolate article 18, a version pair, `introduced` changes, missing explanations, and
  changes with/without sources.
- Diff display highlights the changed fragment text clearly enough for editorial review.
- Feedback can be submitted without an account and cannot be trivially spammed in bulk.
- Feedback data does not expose private user information by default.

Explicitly not included:

- Full moderation workflow.
- User profiles.
- Public comments.

## Future Work

### 8. Amendment Monitoring And Confirmed Import

Priority: P3.
Status: future, not in the next implementation batch.

Goal:

- Detect new 63-FZ amendments and import new law versions only through a reviewable,
  confirmable operation.

Tasks:

- Periodically check for new 63-FZ amendments.
- Notify when a possible new change is found.
- Store check results and the last successful check date.
- Never automatically publish legal text without review.
- Add dry-run import for a new revision.
- Report added, changed, and deleted fragments.
- Require manual confirmation before making a new version current.
- Create a backup before writes.
- Provide a safe cancellation or rollback path.
- Protect against accidentally reassigning an older version as current.
- Ensure the ordinary importer does not silently change `currentVersionId` when that was not the
  requested operation.

Dependencies:

- Source metadata/freshness UI.
- Snapshot invalidation.
- Importer validation and backup discipline.

Acceptance criteria:

- A monitoring run records when it checked and what it found.
- Import dry-run produces a human-readable report before any write.
- A write that changes `currentVersionId` requires explicit confirmation.
- Backups are created before write operations.
- Re-running the same import is idempotent or fails safely with a clear explanation.

Explicitly not included:

- Fully automatic publication of legal text.
- Legal interpretation of amendments without editorial review.

### 9. Markdown Export

Priority: P3.
Status: future.

Goal:

- Export an improved Markdown representation after the reader, search, and change-review workflow
  are more stable.

Tasks:

- Add protected Markdown export.
- Use accepted proposed revisions where appropriate.
- Include change rationale and source metadata.
- Keep official text and proposed/editorial text clearly separated.

Dependencies:

- Publication-status filtering.
- Source metadata.
- Improved change links and accepted proposed-revision workflow.

Acceptance criteria:

- Export is protected.
- Export output is deterministic.
- Export does not include drafts or non-public editorial material.
- Export clearly distinguishes original law text from proposed improvements.

Explicitly not included:

- Public export endpoint.
- Bulk document generation formats beyond Markdown.

### Future Domain Move Preparation

Priority: P3.
Status: future.

Goal:

- Avoid hard dependencies on the current test placement and prepare for a later move to another
  domain.

Tasks:

- Keep current `/63fz` placement test-only.
- Do not integrate with the main `mescheryakov.pro` navigation, sitemap, menu, design, or structure
  at this stage.
- Make base path configurable instead of assuming `/63fz` forever.
- Make canonical URL configurable.
- Audit hard-coded current-domain references in public metadata, import user agents, docs, and links.

Dependencies:

- Decision on the future domain and route shape.

Acceptance criteria:

- App can be configured for a different base path/canonical URL without code edits.
- Current test route still works until the move happens.
- No main-site sitemap, menu, or design changes are made as part of this preparation.

Explicitly not included:

- The domain move itself.
- Main-site integration.

### 11. Multi-User Authentication, Roles, And Audit

Priority: P3.
Status: future.

Goal:

- Replace the single administrative password with a proper administrative model.

Tasks:

- Add user accounts.
- Add roles and permissions.
- Add secure password/OAuth/SSO decision.
- Add audit log for administrative actions.
- Migrate the existing admin workflow without exposing drafts.

Dependencies:

- Security hardening.
- Clear editorial roles and workflow.

Acceptance criteria:

- Every administrative action is attributable.
- Role boundaries are enforced on the server.
- Existing content is preserved through migration.

Explicitly not included:

- This is not part of the immediate security hardening stage.

## Deferred Tasks

### 10. Mobile Responsive Rework

Priority: deferred.
Status: known issue, not in the next stage.

Known problem:

- At mobile widths, the interface can produce strong horizontal overflow.
- The table of contents and main content can stretch the page significantly wider than the viewport.
- The mobile version needs a dedicated responsive pass.

Dependencies:

- Reader layout decisions after empty sections and query optimization.

Acceptance criteria for the later mobile pass:

- No significant horizontal overflow at common mobile widths.
- The table of contents, version controls, change history, and law text remain usable on mobile.
- Long stable IDs, source links, and legal text do not force the viewport wider than the device.
- A responsive smoke test covers the core reader screen.

Explicitly not included now:

- CSS fixes in the current documentation-only pass.
- Moving mobile work into the immediate Security or CI stages.
