# Product Development Plan

This document is the current product roadmap for the 63-FZ legal-tech reader and editorial CMS.
Chronological implementation details stay in `docs/PROGRESS.md`; this file tracks what is already
accepted, what remains intentionally deferred, and what should happen next.

## Current Baseline

Status: public test deployment at `https://mescheryakov.pro/63fz`.

- The app is a Next.js/TypeScript/Prisma/PostgreSQL service deployed as an isolated `/63fz`
  application behind Caddy.
- The database contains real imported 63-FZ text with stable fragments down to article, part, point,
  and paragraph where the parser can identify them.
- Several real law versions are imported and can be compared by stable fragment identity.
- The public reader supports version selection, tree navigation, focus/feed modes, change history,
  source metadata, search, filters, change permalinks, feedback buttons, and hidden empty editorial
  sections.
- The admin area is protected by one password-based administrative account and supports fragment
  editorial materials plus change explanations.
- Article 18 has a completed editorial pilot for granular published change explanations.
- Amendment monitoring is available as a safe CLI workflow and does not publish legal text
  automatically.
- Markdown export is protected/admin-only and limited to deterministic Markdown.

The current domain/path is still a test placement. Do not treat `/63fz` or `mescheryakov.pro` as
the final product placement.

## Completed And Accepted

The following points are accepted as the current baseline and reopened when a regression, new risk,
or new requirement appears.

### Foundation

Status: done.

- Public GitHub repository and local project workspace.
- Next.js application with `basePath: "/63fz"`.
- Isolated production deployment as `63fz-legal-tech.service` on VDSina.
- PostgreSQL-backed Prisma schema and production database.
- Password-protected admin shell and fragment CRUD.
- Real 63-FZ import pipeline with source metadata and checksums.
- Detailed fragment parser and stable fragment hierarchy.
- Public tree reader with focus/feed modes.
- Version-aware reader with current/historical law versions.
- Pairwise change history for `introduced`, `changed`, and `deleted`.
- `FragmentChangeExplanation` storage, admin editor, and public rendering.
- Article 18 editorial pilot and aggregate article duplicate filtering.

### Roadmap Points 1-11

1. Security Hardening: v1 complete.
   - Removed unsafe production auth fallback.
   - Added secret validation, login rate limiting, logout, hardened cookies, security headers,
     public-status filtering, server-side validation, and destructive-action confirmation.

2. Lightweight Tests And CI: v1 complete, integration layer started.
   - Added `pnpm test` with Node's test runner through `tsx`.
   - Added Prisma validation, typecheck, lint, fast tests, and production build to GitHub Actions.
   - The fast suite is kept intentionally lightweight and grows only for targeted regression
     coverage.
   - Added an opt-in DB-backed integration test (`INTEGRATION_DATABASE_URL`) asserting the public
     reader never exposes draft versions, draft editorial content, or draft change explanations;
     CI runs it against a disposable PostgreSQL service database.
   - Next targeted extension: authorization regression coverage for admin write endpoints.

3. Hide Empty Editorial Sections: done.
   - Removed repeated empty placeholder editorial blocks from the public reader.
   - Kept one concise empty state only where it helps orientation.

4. Reader Query Optimization / In-Process Snapshot: v1 complete for the current full-reader screen.
   - Reader data loading is narrower than the original "load everything" approach.
   - Published reader data has an in-process snapshot keyed by selected version plus an explicit
     invalidation marker.
   - Admin pages bypass the public snapshot.

5. Public Freshness And Source Metadata: done for imported version metadata.
   - Reader shows current/historical status, effective date, source, source check/retrieval date,
     and safe source links.
   - Official law text is visually separated from editorial material.

6. Search Across Law Text And Change History: done for lightweight in-reader search.
   - Search covers public law text, stable IDs/titles, public editorial blocks, published change
     explanations, and safe source links.
   - Search results link back to focused stable fragments.

7. Improved Diff View, Filters, Permalinks, And Feedback: done for v1.
   - Public change filters cover article, version pair, change type, explanation status, and source
     presence.
   - Concrete change permalinks are stable across refreshes.
   - Changed word ranges are highlighted.
   - Anonymous feedback is stored with salted client hashes, not raw IP/user-agent values.

8. Amendment Monitoring CLI And Confirmed Import: v1 complete for the safe CLI workflow.
   - `pnpm law:monitor:63fz` checks the consolidated source and writes state/report files.
   - Importer no longer changes `currentVersionId` by default.
   - Making a version current requires `--set-current --confirm-set-current <versionId>`.
   - `--write` creates a database backup first and refuses to make older effective versions current.

9. Markdown Export: done for protected Markdown-only export.
   - Admin-only `/63fz/admin/export/markdown`.
   - `pnpm law:export:markdown` in the repository.
   - Export is deterministic, excludes non-public materials, includes version/source/checksum
     metadata, and keeps official text separate from accepted proposed revisions.
   - No public export endpoint was added.

10. Responsive Hardening: v1 complete for the core overflow-hardening pass.
    - Core public reader and admin screens use safer mobile padding, wrapping, and grid/flex
      constraints.
    - Long stable IDs, source links, snippets, and version labels no longer force document-level
      horizontal overflow in the checked responsive cases.

11. Residual Correctness And Security Cleanup: complete for the accepted scope.
    - Reader snapshot keys are normalized to the selected published/archived version and stored in
      a bounded in-process cache; database-error fallback is allowed only for the exact selected
      version cache key and otherwise fails closed.
    - Reader cache marker paths are normalized and restricted to approved temporary directories,
      including the current OS temp directory for portable local tests.
    - Public change feedback validates the concrete adjacent public `63fz` transition before
      writing.
    - Reader, admin change history, and feedback use the same deterministic public-version order:
      `effectiveDate`, then `createdAt`, then `id`.
    - Feedback rate-limit buckets are bounded and stale buckets are pruned.
    - Amendment monitor import detection uses exact source identity: `moduleId`, `documentId`,
      `revisionDate`, and `effectiveDate`.
    - Kontur source URL parsing accepts only `https://normativ.kontur.ru` with present positive
      safe-integer `moduleId` and `documentId`.
    - Production dependency advisories are currently clear after a compatible Next.js update plus
      a focused PostCSS override.
    - Standalone tracing no longer emits the `unexpected file in NFT list` warning for the reader
      cache marker.
    - `pnpm run typecheck` regenerates Prisma Client first, so schema changes after pull are less
      likely to use a stale generated client.

### Post-Cleanup Hardening (2026-07-13)

Status: done.

- Base path is configurable via `NEXT_PUBLIC_BASE_PATH` (build-time): Next.js `basePath`, admin
  links, markdown-export redirect, and the session cookie path all go through a shared validated
  helper (`src/lib/base-path.ts`) instead of hardcoded `/63fz` strings.
- Amendment monitor reuses `PUBLIC_LAW_SLUG`/`PUBLIC_VERSION_STATUSES` from `src/lib/law-scope.ts`
  instead of duplicating them.
- DB-backed publication-policy integration test added to `pnpm test` and CI (see point 2).
- Documented the stable fragment ID contract (`docs/STABLE-ID.md`) and the operations runbook
  (`docs/OPERATIONS.md`), including the reader-cache marker PrivateTmp caveat.

## Current Known Gaps

These are product risks or limitations, not all immediate next steps.

- Core reader and admin screens have had a responsive overflow pass; final visual polish remains a
  public-launch concern, not a duplicate implementation stage.
- The admin model is still one shared password; there are no users, roles, or audit logs.
- Change feedback has no moderation or analytics dashboard.
- Search is lightweight in-reader search, not database full-text search.
- Amendment monitoring is intentionally manual. The project owner will signal when the law changes;
  scheduled monitoring is deferred to the very end of the roadmap.
- There is no separate durable "last checked for newer amendments" database field beyond monitor
  state files and imported source retrieval metadata.
- Production database migration history is partly manual; the database has historically not used a
  clean `_prisma_migrations` history table. This must be reconciled before any next schema change
  (see point 16, now P1).
- The deployment path is a test placement. The base path itself is now configurable at build time,
  but canonical-URL/domain references (`mescheryakov.pro`) remain in docs, metadata, and source
  labels.
- Reader-cache invalidation across processes is verified on the host (2026-07-13): the unit runs
  with `PrivateTmp=no` and CLI imports do invalidate the running server's cache. Re-verify if the
  unit configuration changes; see `docs/OPERATIONS.md`.
- Editorial coverage outside article 18 is still sparse.
- The app has a pragmatic public snapshot, but no broader observability, error reporting, or
  operational dashboard.
- The current reader still renders the full selected reader view; further payload reduction may be
  needed if real usage shows page weight or interaction latency problems.

## Functional Readiness Roadmap

The application already has the technical foundation required for real use. The largest remaining
gap is not another platform feature: it is a clear use model and trustworthy editorial coverage
beyond the article 18 pilot. Hosting and the final domain are deliberately outside this sequence.

### 12. Intended Use, Primary Audience, And Acceptance Scenarios

Priority: P1.
Status: next.

Goal:

- Define exactly who uses the product, what decision or legal-reading task it helps with, and what
  a successful end-to-end session looks like.

Tasks:

- Choose the primary reader segment and the primary editorial operator.
- Write 5-10 concrete reader scenarios: find the applicable wording, compare revisions, understand
  why a norm changed, follow the source, and report an unclear or incorrect explanation.
- Run the scenarios with several representative users and record failures, confusing labels, and
  missing content.
- Define a small set of readiness criteria and privacy-conscious usefulness signals.

Acceptance criteria:

- The project has one primary audience and a documented set of real tasks.
- Each task can be completed on the current product or creates a specific, evidence-backed backlog
  item.
- Later search, navigation, and editorial work is tied to observed needs rather than assumptions.

### 13. Editorial Coverage Expansion

Priority: P1.
Status: future.

Goal:

- Turn the article 18 pilot into useful coverage of the most important 63-FZ provisions and changes.

Tasks:

- Rank articles and version transitions using the scenarios from point 12.
- Build a coverage matrix by article, version pair, transition type, publication status, and source.
- Fill granular explanations with reason, purpose, practical meaning, and source links.
- Keep aggregate article duplicates unpublished unless they add unique value.
- Do not invent legal interpretation and do not bulk-publish generated explanations.

Acceptance criteria:

- Every selected article has no meaningful missing granular explanation for the selected version
  pairs.
- Published explanations have reviewable sources, preferably official publication links.
- Public pages show published material and omit drafts and internal duplicates.

### 14. Editorial Quality Assurance And Publication Workflow

Priority: P1.
Status: future.

Goal:

- Make editorial publication repeatable and safe, not dependent on remembering an informal process.

Tasks:

- Define a checklist for factual accuracy, source quality, wording, fragment scope, version pair,
  and public status.
- Add a compact coverage/review view only where the existing admin filters are insufficient.
- Require a final preview of the public fragment and its change permalink before publication.
- Document correction, unpublish, and rollback procedures for editorial content.
- Verify deterministic Markdown export as an editorial audit artifact.

Acceptance criteria:

- An editor can move an explanation from draft to checked publication using a documented flow.
- Every published explanation is traceable to a source and the correct concrete transition.
- A bad explanation can be corrected or unpublished without editing official law text.

### 15. Feedback Review And Usage Evidence

Priority: P2, gated.
Status: future.

Dependency/gate:

- Start after representative users have tried the scenarios or enough real feedback has accumulated.

Goal:

- Turn feedback into an editorial queue and verify whether the product is genuinely useful.

Tasks:

- Add an admin view for feedback grouped by change, kind, article, version pair, and time period.
- Link each group to the relevant change editor and public permalink.
- Add minimal review state only if needed for a recurring workflow.
- Keep client hashes private and avoid broad analytics or unnecessary personal data.

Acceptance criteria:

- Editors can find explanations marked unclear or wrong and close the loop with a correction.
- The project has documented evidence of completed and failed user tasks.
- Feedback review exposes no raw client identity data.

### 16. Import, Migration, Backup, And Rollback Hardening

Priority: P1 before the next schema change or law import.
Status: future. The descriptive runbook exists in `docs/OPERATIONS.md`; the remaining work is to
reconcile production migration history and verify backup restore.

Goal:

- Make production data operations auditable and repeatable without relying on session memory.

Tasks:

- Document the missing/partial Prisma migration history and owner/app-role responsibilities.
- Create a preflight checklist for schema changes, imports, backups, deployment, verification, and
  rollback.
- Add a small read-only status/preflight command if it materially reduces operator error.
- Verify backup naming, location, restore readability, and retention rules.
- Keep every law import as an explicit dry-run, reviewed write, and separately confirmed current
  version switch.

Acceptance criteria:

- The next migration and the next law import both have an explicit runbook before execution.
- Backups and rollback boundaries are clear and consistently verified.
- No destructive repair of migration history is performed without separate approval.

### 17. End-To-End Usability And Accessibility Pass

Priority: P2.
Status: future.

Goal:

- Remove practical barriers found in the real scenarios after the completed responsive overflow
  pass.

Tasks:

- Test keyboard navigation, focus visibility, labels, headings, contrast, and screen-reader basics.
- Test public reader flows on representative mobile and desktop browsers.
- Test admin create, edit, preview, publish, unpublish, and export flows end to end.
- Fix only reproducible usability problems and add focused regression coverage where practical.

Acceptance criteria:

- Primary reader scenarios work without mouse-only controls or layout breakage.
- Core admin publication flows complete without ambiguous state or lost work.
- Remaining launch-only visual polish is documented separately.

### 18. Evidence-Driven Search And Reader Performance Improvements

Priority: P2, gated.
Status: future.

Dependency/gate:

- Implement only when point 12 or production measurements show a concrete search or payload problem.

Tasks:

- Measure real queries, result quality, page payload, response time, and interaction cost.
- Improve ranking and filters before considering PostgreSQL full-text search or a separate index.
- Consider focus-view or fragment-level loading only if it measurably improves the affected flows.
- Preserve stable fragment/change links and server-side public-status filtering.

Acceptance criteria:

- Each change improves a documented query or performance baseline.
- Drafts and internal material remain excluded.
- No external search service is introduced before local options are exhausted.

### 19. Multi-User Administration, Roles, And Audit

Priority: P2, gated.
Status: future.

Dependency/gate:

- Implement when more than one person regularly edits or reviews content. A single operator can keep
  the hardened shared-admin workflow until then.

Goal:

- Make administrative writes attributable and enforce editor/reviewer boundaries when a team exists.

Tasks:

- Define the smallest useful role set.
- Add users, sessions, server-enforced role checks, and audit logging.
- Migrate the existing admin workflow without exposing drafts or breaking public content.

Acceptance criteria:

- Every administrative write is attributable.
- Role boundaries are enforced on the server.
- Public registration and reader accounts remain out of scope.

### 20. Scheduled Amendment Monitoring

Priority: last.
Status: explicitly deferred by the project owner.

Goal:

- Automate the already working manual monitor only after the functional product work above is done.

Tasks:

- Until then, run the existing monitor manually when the project owner reports a law change.
- At the final stage, choose a quiet schedule and notify only on a new revision or failure.
- Keep imports and current-version changes manual, reviewed, backed up, and explicitly confirmed.

Acceptance criteria:

- Routine checks do not spam the Telegram topic.
- The monitor never imports or publishes law text automatically.
- A new revision still requires dry-run review and explicit confirmation.

## Outside The Functional Readiness Sequence

- Hosting changes, final domain selection, canonical URL, SEO, sitemap/robots, main-site integration,
  and launch-only visual polish are a separate approved launch project. The application base path is
  already configurable at build time.
- Lightweight service, disk, and backup checks remain ordinary operations; they do not require or
  justify scheduled amendment monitoring.

## Current Recommendation

Recommended order after the completed correctness cleanup:

1. Define and test the intended use and primary audience.
2. Expand editorial coverage beyond article 18.
3. Formalize editorial review and publication quality control.
4. Harden import/migration/backup operations before the next data or schema change.
5. Use real evidence to decide whether feedback tooling, accessibility fixes, search/performance
   work, or multi-user administration is actually needed.
6. Add scheduled amendment monitoring last.
