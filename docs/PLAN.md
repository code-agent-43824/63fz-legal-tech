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
- The admin model is still one shared password; there are no attributable expert accounts, roles,
  or audit logs. The owner interview makes this a functional-readiness gap, not optional future work.
- Change feedback has no moderation or analytics dashboard.
- Search is lightweight in-reader search, not database full-text search.
- Amendment monitoring is intentionally manual. The project owner will signal when the law changes;
  scheduled monitoring is deferred to the very end of the roadmap.
- There is no separate durable "last checked for newer amendments" database field beyond monitor
  state files and imported source retrieval metadata.
- Production migration history is reconciled at five migrations with no schema drift. Keep using the
  dedicated migration owner, verified backups, restore tests, and preflight from point 13.
- The deployment path is a test placement. The base path itself is now configurable at build time,
  but canonical-URL/domain references (`mescheryakov.pro`) remain in docs, metadata, and source
  labels.
- Reader-cache invalidation across processes is verified on the host (2026-07-13): the unit runs
  with `PrivateTmp=no` and CLI imports do invalidate the running server's cache. Re-verify if the
  unit configuration changes; see `docs/OPERATIONS.md`.
- Editorial coverage outside article 18 is still sparse.
- There is no formal AI-draft-to-expert-publication workflow.
- References from 63-FZ to other laws and subordinate acts are not yet presented as a structured
  reader aid.
- The app has a pragmatic public snapshot, but no broader observability, error reporting, or
  operational dashboard.
- The current reader still renders the full selected reader view; further payload reduction may be
  needed if real usage shows page weight or interaction latency problems.

## Functional Readiness Roadmap

The product-owner interview is recorded in `docs/PRODUCT-USE.md`. It confirms that the remaining
core is an expert-authored explanatory reader: attributable expert participation, safe editorial
publication, and useful coverage are now more important than optional analytics or search upgrades.
Hosting and the final domain remain outside this sequence.

### 12. Intended Use And Acceptance Scenarios

Priority: P1.
Status: product-owner interview complete; representative-user validation pending.

- Keep `docs/PRODUCT-USE.md` as the source of truth for audiences, ranked jobs, scenarios, trust
  rules, and minimum readiness.
- Test the documented scenarios with several representative readers and invited expert contributors.
- Turn only observed failures into new requirements.

Acceptance criteria:

- Several target readers can find a norm, confirm its version, and understand its plain-language
  explanation.
- Several expert contributors can describe the contribution workflow and complete it in a test.
- Any remaining blockers are concrete and reproducible.

### 13. Import, Migration, Backup, And Rollback Hardening

Priority: P1.
Status: done 2026-07-16.

- Reconciled four previously manual migrations as Prisma baselines and applied a fifth normalizing
  migration; migration status is current and schema drift is empty.
- Introduced dedicated non-superuser `fz63_migrator` ownership and restricted `fz63_app` to runtime
  CRUD without schema creation.
- Created `pnpm run db:ops:check` for migration checksum/state, ownership, runtime privileges, and
  minimum law-state verification; CI runs it against the disposable database.
- Created and test-restored a custom-format production backup; all application-table counts and
  deterministic content hashes matched.
- Updated `docs/OPERATIONS.md` with the verified migration/backup/rollback workflow.

Acceptance criteria:

- Production migration history and schema match the repository migrations without drift.
- A production backup can be restored into an isolated verification database.
- The next migration and law import have explicit preflight, role, backup, and verification steps.

### 14. Expert Accounts, Authorship, Roles, And Moderation

Priority: P1.
Status: done.

- Replace the single shared editorial identity with attributable expert accounts and sessions.
- Use the smallest role set that supports expert publication and administrator moderation.
- Bind expert name/professional description to the account rather than trusting a free-text author
  field on every contribution.
- Let experts create, preview, and publish their own explanations/comments.
- Let administrators edit, unpublish, or delete contributions and retain a minimal audit record.
- Keep reader accounts, public registration, and public discussion threads out of scope.

Completed:

- Added invitation-only `EditorialUser` accounts with `admin` and `expert` roles, active/disabled
  status, salted scrypt password hashes, and signed eight-hour sessions.
- Bound expert display name and professional title to the account; profile changes update authored
  public snapshots, while private login/password fields never enter reader queries.
- Experts can create, preview, and edit only their own plain-language explanations and comments;
  publication now goes through point 15's mandatory review flow. Issue/proposal editing, deletion,
  account management, and export remain administrator-only; change explanations may be assigned to
  a responsible expert for review.
- Added account creation, disabling, profile updates, password reset, moderation controls, and a
  compact audit view. Login/logout, account changes, content writes/deletes, and change-explanation
  writes/deletes are audited without storing contribution text or passwords.
- Added authorization/password tests plus DB-backed public-data assertions for named attribution and
  non-disclosure of username/password hashes.

Acceptance criteria:

- Every expert contribution has an attributable author.
- Server-side authorization prevents experts from using administrator-only actions.
- The public reader shows author identity without exposing private account data.
- Administrative moderation is logged and test-covered.

### 15. Editorial Workflow And AI-Draft Safeguards

Priority: P1.
Status: done 2026-07-16.

- Define the content types for a short plain-language version, expert comment, recommendation, and
  change explanation without mixing them with official law text.
- Let AI-assisted text enter only as a clearly marked non-public draft.
- Require expert review, preview, and explicit publication before AI-assisted text becomes public.
- Define correction and unpublish procedures plus a factual/source/scope/version checklist.
- Add a compact coverage/review view only where existing admin filters are insufficient.

Completed:

- Added explicit `draft -> in_review -> published -> unpublished` states for explanations,
  comments, recommendations, and change explanations. Editing any reviewed item resets it to draft.
- Added immutable AI-assisted provenance: an AI draft is always non-public until its responsible
  expert confirms factual accuracy, sources, editorial scope, law version, and named responsibility.
- Split practical recommendations from expert comments in both the editor and public reader.
- Added expert assignment for change explanations, preview controls, correction/unpublish actions,
  reviewed-content hashes, audit events, and a compact role-filtered editorial queue.

Acceptance criteria:

- An expert can move a draft through review to publication without ambiguous status.
- No AI-assisted draft is public before expert responsibility is explicit.
- A bad explanation can be corrected or unpublished without changing official law text.

### 16. Priority Editorial Coverage, Starting With Article 13

Priority: P1.
Status: future.

- Use article 13 as the next representative pilot for a short explanation and expert commentary.
- Prioritize simple explanation, practical recommendations, norm comparison, and reasons for change.
- Build a coverage matrix by article, version pair, content type, status, author, and source.
- Expand to other high-value provisions after the article 13 workflow is accepted.
- Do not invent legal interpretation and do not bulk-publish generated text.

Acceptance criteria:

- Article 13 has an expert-reviewed plain-language explanation that resolves the identified
  readability problem without replacing or distorting the official wording.
- Selected priority articles have no meaningful missing content for the chosen use scenarios.
- Published material has attributable authorship and reviewable sources where relevant.

### 17. Cross-References To Other Laws And Acts

Priority: P2.
Status: future.

- Identify explicit references from 63-FZ to other laws and subordinate acts.
- Present safe links and concise context without copying or maintaining unrelated full texts.
- Distinguish references found in official text from editorial recommendations or commentary.

Acceptance criteria:

- A reader can understand what external act a provision relies on and follow a reliable link.
- Broken or unsafe links do not render as trusted public references.
- The feature does not become a general legal-reference database.

### 18. End-To-End Usability And Accessibility Validation

Priority: P2.
Status: future.

- Test the `docs/PRODUCT-USE.md` reader and contributor scenarios on representative mobile and
  desktop browsers.
- Test keyboard navigation, focus visibility, labels, headings, contrast, and screen-reader basics.
- Test expert create/preview/publish and admin correct/unpublish/delete flows end to end.
- Fix reproducible usability problems and add focused regression coverage where practical.

Acceptance criteria:

- Core reader tasks work without mouse-only controls or layout breakage.
- Expert and administrator workflows complete without ambiguous state or lost work.
- The product owner accepts the visual result apart from launch-only domain/branding polish.

### 19. Usage Evidence, Feedback, And Conditional Improvements

Priority: P2, gated.
Status: future.

- Measure repeat use, popular articles/comments, expert contribution activity, and voluntary
  usefulness feedback without collecting unnecessary personal data.
- Add an admin feedback queue only after enough feedback exists to justify it.
- Improve search ranking, filters, or reader payload only when real queries or measurements expose a
  concrete problem.
- Keep client hashes private and keep reader accounts out of scope.

Acceptance criteria:

- The project can tell whether readers return, experts contribute, and readers report that it helped.
- Each search/performance change addresses a documented failure or baseline.
- Feedback tooling exposes no raw client identity data.

### 20. Scheduled Amendment Monitoring

Priority: last.
Status: explicitly deferred by the project owner.

- Until then, run the existing monitor manually when the project owner reports a law change.
- At the final stage, notify only on a new revision or failure.
- Never import or publish law text automatically; keep dry-run review, backup, and explicit current
  version confirmation.

Acceptance criteria:

- Routine checks do not spam the Telegram topic.
- The monitor never imports or publishes law text automatically.
- A new revision still requires reviewed and explicit confirmation.

## Outside The Functional Readiness Sequence

- Hosting changes, final domain selection, canonical URL, SEO, sitemap/robots, main-site integration,
  and launch-only visual polish are a separate approved launch project. The application base path is
  already configurable at build time.
- Lightweight service, disk, and backup checks remain ordinary operations; they do not require or
  justify scheduled amendment monitoring.

## Current Recommendation

Recommended order after the completed correctness cleanup:

1. Build attributable expert participation and the safe editorial workflow in points 14-15.
2. Use article 13 as the next coverage pilot, then expand based on observed reader needs.
3. Finish point 12 with representative reader/expert scenario tests as soon as contributors are
   available.
4. Add cross-references and complete end-to-end usability validation.
5. Add analytics, feedback tooling, or search/performance work only when evidence justifies it.
6. Add scheduled amendment monitoring last.
