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

### Roadmap Points 1-10

1. Security Hardening: v1 complete.
   - Removed unsafe production auth fallback.
   - Added secret validation, login rate limiting, logout, hardened cookies, security headers,
     public-status filtering, server-side validation, and destructive-action confirmation.

2. Lightweight Tests And CI: v1 complete.
   - Added `pnpm test` with Node's test runner through `tsx`.
   - Added Prisma validation, typecheck, lint, fast tests, and production build to GitHub Actions.
   - The fast suite is kept intentionally lightweight and grows only for targeted regression
     coverage.

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

## Current Known Gaps

These are product risks or limitations, not all immediate next steps.

- Core reader and admin screens have had a responsive overflow pass; final visual polish remains a
  public-launch concern, not a duplicate implementation stage.
- The admin model is still one shared password; there are no users, roles, or audit logs.
- Change feedback has no moderation or analytics dashboard.
- Search is lightweight in-reader search, not database full-text search.
- Amendment monitoring is manual CLI work, not a scheduled alerting job.
- There is no separate durable "last checked for newer amendments" database field beyond monitor
  state files and imported source retrieval metadata.
- Production database migration history is partly manual; the database has historically not used a
  clean `_prisma_migrations` history table.
- The deployment path is a test placement; base path and canonical URL are still effectively tied to
  `/63fz` in several places.
- Editorial coverage outside article 18 is still sparse.
- The app has a pragmatic public snapshot, but no broader observability, error reporting, or
  operational dashboard.
- The current reader still renders the full selected reader view; further payload reduction may be
  needed if real usage shows page weight or interaction latency problems.

## Future Roadmap

The next sequence should improve legal freshness, operating discipline, and product evidence without
opening a new public surface too early.

### 12. Scheduled Amendment Monitoring And Lightweight Operational Visibility

Priority: P1.
Status: future.

Goal:

- Move the existing monitor from manual CLI use to controlled scheduled checks and basic operational
  visibility.

Tasks:

- Decide whether heartbeat or cron is the right scheduler for this project.
- Store job-specific behavior in automation memory if cron is used.
- Run `pnpm law:monitor:63fz` on a safe cadence.
- Notify only when a newer source revision appears or the monitor fails.
- Track lightweight operational signals: health check, disk usage, backup freshness, and failed
  monitor/import attempts.
- Keep state and reports under the production imports directory.

Acceptance criteria:

- Routine checks do not spam the Telegram topic.
- Failures are visible with enough detail to debug.
- A detected new revision still requires manual dry-run review and explicit import confirmation.
- The monitor never writes law text to the database by itself.
- Basic health/disk/backup freshness can be checked without a heavy observability platform.

Explicitly not included:

- Automatic import.
- Automatic publication of a new current version.
- Heavy observability platform.

### 13. Product Validation And Usage Evidence

Priority: P1.
Status: future.

Goal:

- Validate that the product solves a real problem for a clearly defined user segment before building
  more workflow around assumptions.

Tasks:

- Define the primary user segment.
- Run 5-8 interviews with likely users or buyers.
- Collect real search queries and article/change-navigation tasks.
- Define lightweight usefulness metrics.
- Identify which articles, changes, and explanations are actually demanded.
- Avoid collecting or retaining unnecessary personal data.

Acceptance criteria:

- Future editorial and search work is tied to observed user needs.
- The project has documented signals for what readers find useful or confusing.
- No unnecessary personal data is introduced as part of validation.

Explicitly not included:

- Broad analytics collection before there is a privacy-conscious measurement plan.

### 14. Editorial Coverage Expansion

Priority: P1.
Status: future.

Goal:

- Move beyond the article 18 pilot and create a repeatable editorial workflow for important 63-FZ
  changes.

Tasks:

- Select the next high-value articles or change clusters using validation evidence where possible.
- Use admin filters to find missing published change explanations.
- Fill granular explanations with source links.
- Keep aggregate article duplicates unpublished unless they add unique value.
- Track editorial coverage by article and version pair.

Acceptance criteria:

- Each selected article has no meaningful missing granular explanation for the chosen version pairs.
- Public pages show published explanations and omit drafts.
- Source links are safe `https:` links and preferably official publication links where available.
- Progress is documented in `docs/PROGRESS.md` or a dedicated editorial coverage note.

Explicitly not included:

- Inventing legal interpretation without sources.
- Bulk auto-generated explanations.

### 15. Feedback Review Dashboard

Priority: P2, gated.
Status: future.

Dependency/gate:

- Build this only after enough real feedback accumulates to justify a dashboard or after a regular
  editorial review process exists.

Goal:

- Turn anonymous change feedback into an admin-reviewable editorial signal when there is enough data
  to review.

Tasks:

- Add an admin view for aggregated `ChangeFeedback`.
- Show counts by change, kind, article, version pair, and time period.
- Link feedback rows to the relevant admin change editor.
- Add basic review status only if a small table is justified.
- Keep raw client identifiers private; do not expose client hashes unless needed for abuse handling.

Acceptance criteria:

- Admin can identify changes that readers mark as unclear or wrong.
- Feedback review does not expose private client data.
- Review state, if added, is server-validated and test-covered.
- Public feedback submission behavior remains stable.

Explicitly not included:

- User accounts.
- Public comments.
- Full moderation/community workflow.

### 16. Import And Migration Operations Hardening

Priority: P2.
Status: future.

Goal:

- Make production data operations easier to audit and less dependent on manual institutional memory.

Tasks:

- Document the current production migration reality, including the missing/partial Prisma migration
  history.
- Create a repeatable preflight checklist for schema changes, backups, owner/app-role permissions,
  release deployment, and rollback.
- Consider a small operations script for backup plus migration status reporting.
- Ensure import/export/monitor scripts can run reliably in the intended environment.

Acceptance criteria:

- A future schema migration has an explicit runbook before it is applied.
- Backups are named, located, and verified consistently.
- App role and owner role responsibilities are documented.
- Rollback boundaries are clear.

Explicitly not included:

- Rebuilding the production database from scratch.
- Destructive migration history surgery without a separate approval.

### 17. Further Reader Payload Reduction

Priority: P2.
Status: future.

Goal:

- Reduce public reader payload and client work if real usage or measurements show the full selected
  reader view is too heavy.

Tasks:

- Measure current page payload and interaction cost on real reader paths.
- Consider fragment-level loading, server-rendered focus view, or another progressive loading model.
- Preserve stable fragment/change permalinks.
- Keep public-status filtering server-side.

Acceptance criteria:

- Payload or interaction improvements are measurable.
- Legal text remains accessible and linkable.
- Search/change-history behavior does not expose drafts or internal data.

Explicitly not included:

- Implementing this before there is evidence that the current payload is a real problem.

### 18. Multi-User Authentication, Roles, And Audit

Priority: P2.
Status: future.

Goal:

- Replace the single shared admin password with attributable administrative access.

Tasks:

- Define roles: owner/admin/editor/reviewer or a smaller set if enough.
- Choose password auth, OAuth, SSO, or another appropriate model.
- Add users and sessions.
- Add server-enforced role checks for admin screens/actions.
- Add audit logging for content and configuration changes.
- Migrate the existing single-admin workflow without exposing drafts.

Acceptance criteria:

- Every administrative write is attributable.
- Role boundaries are enforced on the server.
- Existing content and admin flows continue to work after migration.
- Audit rows include enough context to review changes without storing secrets.

Explicitly not included:

- Public registration.
- Reader accounts.

### 19. Search Upgrade

Priority: P3.
Status: future.

Goal:

- Improve search quality only when lightweight in-reader search is measurably insufficient.

Tasks:

- Measure current search gaps against real queries.
- Decide between PostgreSQL full-text search and a separate index only if the local approach is not
  enough.
- Add filters for article, version, content type, and change type if needed.
- Preserve stable fragment/change links in results.

Acceptance criteria:

- Search quality improves on documented real queries.
- Search still excludes drafts and non-public materials.
- Index/update behavior is clear after editorial writes and imports.

Explicitly not included:

- External search service before local options are exhausted.

### 20. Domain Move And Public Launch Preparation

Priority: P3.
Status: future.

Goal:

- Prepare the app for a future permanent domain/path without disturbing the current test placement.

Tasks:

- Make base path and canonical URL configurable.
- Audit hard-coded `mescheryakov.pro/63fz` references in metadata, docs, import user agents, and
  source labels.
- Decide final route/domain and whether main-site navigation should link to it.
- Prepare SEO metadata, sitemap/robots behavior, and public launch checks only after the domain
  decision.
- Treat final visual polish, including any responsive refinements beyond the accepted v1 pass, as a
  launch concern.

Acceptance criteria:

- The app can run under a different base path/canonical URL without code edits.
- Current `/63fz` test route keeps working until the move.
- Main site integration happens only as a separate approved task.

Explicitly not included:

- The actual domain move.
- Integration with the main site.
- Marketing/landing-page redesign.

## Current Recommendation

Recommended order after the residual cleanup:

1. Scheduled monitoring and lightweight operational visibility.
2. Product validation and editorial coverage expansion.
3. Feedback review only after enough real feedback accumulates or a regular editorial process exists.
4. Migration operations hardening.
5. Remaining future tasks in evidence-driven order.
