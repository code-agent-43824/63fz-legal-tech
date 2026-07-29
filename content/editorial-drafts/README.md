# Editorial drafts

Prepared plain-language explanation drafts waiting for an expert.

## What these files are

Each JSON file holds draft explanations for fragments of the law, keyed by `stableId`. They are
loaded into the database by `pnpm law:import:drafts`, which always writes them with status `draft`
and origin `ai_assisted`. **Nothing here is public and nothing here can become public without a
responsible expert reviewing it and publishing it through the admin workflow**, which requires the
factual, source, scope, version, and responsibility confirmations described in `docs/PLAN.md`
point 15.

## What these drafts are, and what they are not

They are **structural restatements**: the official sentence is broken into its own components —
the general rule, the list of permitted methods, the conditions that must hold together, the
resulting obligation — using the law's own terminology and its own internal references.

They deliberately contain **no legal interpretation**: no conclusions about how a norm applies in
practice, no resolution of ambiguity, no advice, no claims that the official text does not make.
Where the official text is ambiguous, the draft stays ambiguous in the same way.

That boundary exists because the drafts are machine-prepared. Restating structure is verifiable
against the text; interpreting a norm is the expert's work and their professional responsibility.

## What the reviewing expert must do

1. Compare the draft against the official text of the fragment, sentence by sentence.
2. Correct anything the restatement flattened, reordered misleadingly, or lost.
3. Add the practical meaning, risks, and recommendations that the draft intentionally omits.
4. Take named responsibility by publishing under their own account.

An unreviewed draft is a starting point that saves parsing work, not a publishable explanation.

## Provenance

`63fz-article-13.json` was prepared from the article 13 text as served by the public reader on
2026-07-29 (revision of 31.07.2025). Article 13 is the coverage priority named by the product owner
in `docs/PRODUCT-USE.md`; the three chosen fragments are its most overloaded ones — 3487, 1616, and
1273 characters of single-sentence chains.

If the law text changes, re-check the drafts against the new wording before loading them.
