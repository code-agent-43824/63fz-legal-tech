# Product Use Definition

This document records the product-owner interview completed on 2026-07-16. It defines the intended
use of the 63-FZ reader, the first audiences, the core user scenarios, and the minimum functional
readiness criteria. Implementation details remain in `docs/PLAN.md` and `docs/PROGRESS.md`.

## Product Promise

Help people who need to read 63-FZ find the relevant norm and understand its meaning through an
accurate official text, a shorter plain-language explanation, expert commentary, and version
history.

The product is an explanatory reader and editorial platform. It is not a legal-advice service and
must not replace the official text with an automated conclusion.

## Primary Audiences

### Readers

- Lawyers, electronic-signature specialists, certification-authority employees, subject-matter
  experts, and commercial staff who work with electronic signatures.
- Their knowledge of 63-FZ is often approximate rather than specialist-level.
- They usually arrive after a question about interpretation, a need for an exact quotation, or a
  disagreement about what a norm means.
- Their main problem is not access to the statutory text. Existing systems already provide it. The
  problem is understanding long, diffuse wording and extracting the practical meaning.

### Expert contributors

- Practising electronic-signature experts and lawyers who can write plain-language explanations,
  shortened versions, and comments.
- They need version history to understand what changed and why.
- Their contributions should be visible to readers without overwhelming the official text.
- Named authorship and the reputation of the site and its experts are primary trust signals.

## Ranked Jobs To Be Done

The product owner ranked the current jobs in this order:

1. Find the needed article and read both the official text and a short, understandable explanation.
2. Let an expert create a clear human-language retelling or explanation for a provision.
3. Let an expert add a named comment to a provision.
4. Let a lawyer combine official text, plain-language text, expert comments, and version history to
   understand a disputed question.
5. Show which other laws and subordinate acts 63-FZ refers to.

## Core Reader Scenarios

1. A reader searches for a subject or opens an article, confirms the applicable version, and finds
   the exact official wording.
2. A reader opens a concise plain-language explanation and leaves with confidence that the provision
   is understood.
3. A reader compares versions of an article and sees what changed, why it changed where explained,
   and the relevant source.
4. A lawyer reviews expert comments without losing the official-text context.
5. A reader follows a reference from 63-FZ to the cited law or subordinate act.
6. A reader reports an unclear or incorrect explanation without publishing a public comment.

## Core Contributor And Admin Scenarios

1. An expert signs in under an attributable identity, opens the correct fragment/version context,
   writes a plain-language explanation or comment, previews it, and publishes it.
2. An expert or editor saves an AI-assisted first draft as a non-public draft and rewrites/reviews it
   before publication.
3. An administrator can correct, unpublish, or delete an expert contribution while preserving enough
   audit context to understand what happened.
4. An editor can identify provisions that still have no useful explanation and prioritize coverage.

## Editorial Priorities

For reader-facing editorial material, the current priority order is:

1. Simple explanation.
2. Practical recommendations.
3. Comparison of old and new norms.
4. Reason for the change.
5. Judicial or agency material when it supports an explanation.
6. Risks.

Depth is article-dependent. Experts decide whether a provision needs a short explanation, a detailed
one, or no explanation because the provision is purely technical.

Article 13 is the first named coverage priority. The product owner identified parts of its current
wording concerning certification authorities and electronic signatures implemented using state
information systems as especially overloaded and difficult to read. The exact target fragments must
be confirmed against the imported text before drafting the explanation.

## Trust And Publication Rules

- Exact official law text and the selected version must never be confused or silently substituted.
- Official text stays visually and structurally separate from explanations and comments.
- Expert name and professional description must be visible with the contribution.
- Sources are selected by the responsible expert; safe source links remain desirable and auditable.
- AI may help prepare the first draft, but AI-assisted text remains non-public until an expert has
  reviewed or rewritten it and taken responsibility for publication.
- An administrator may edit, unpublish, or delete a contribution.
- A standalone judicial-practice database is out of scope. A court decision may still be cited as a
  supporting source inside an expert explanation.

## Minimum Functional Readiness

Ignoring hosting and the final domain, the product is ready for full intended use when:

- the visual result is accepted by the product owner;
- the loaded law versions are complete, correctly ordered, and never mixed up;
- official text, plain-language explanations, expert comments, and version history work together;
- experts can contribute under attributable identities and the administrator can moderate them;
- priority articles have useful explanation drafts and a safe path from draft to expert publication;
- Article 13 has been used as the next representative editorial pilot;
- the main reader and contributor scenarios pass end to end.

## Usage Evidence

Initial usefulness signals are:

- the site has repeat readers;
- invited experts actually publish explanations or comments;
- readers report, directly or by referral, that the site helped them understand the law.

Later, privacy-conscious analytics may include popular articles and comments plus an occasional
helpfulness question. Broad analytics are not required for the first usable version.

## Explicitly Out Of Scope

- Individual legal consultations.
- Automated legal conclusions.
- A standalone judicial-practice product.
- News publishing.
- Reader personal accounts.
- Public discussion threads.
- Required PDF or other bulk export for the first usable version.
- Scheduled amendment monitoring before the final roadmap stage.

## Open Validation Work

The product-owner interview is complete. Point 12 remains partially open until several representative
readers and expert contributors try the scenarios above. Their observed failures should change the
roadmap only when they reveal a concrete need.
