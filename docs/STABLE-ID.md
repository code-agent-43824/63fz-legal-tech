# Stable Fragment ID Contract

`stableId` is the single most load-bearing concept in this codebase. A fragment keeps the same
stable ID in every imported law version, and that identity is what makes cross-version change
history (`introduced` / `changed` / `deleted`), change explanations, change permalinks, and change
feedback possible. This document fixes the format and the rules that must not be broken when
editing the parser (`scripts/import-63fz.ts`).

## Where stable IDs live

- `LawFragment.stableId`, unique per `[lawVersionId, stableId]` (Prisma schema).
- `LawFragment.anchor` is set to the same value and is used for URL anchors.
- `FragmentChangeExplanation.stableId` and `ChangeFeedback.stableId` reference fragments **by
  string, not by foreign key**. If generation rules change, these rows silently stop matching —
  no constraint will catch it.
- Admin input validation enforces the pattern `^63fz(?:\.[a-z0-9_]+)+$`
  (`src/lib/admin-validation.ts`).

## Format

Produced by the parser in `scripts/import-63fz.ts`:

| Fragment | stableId | Example |
| --- | --- | --- |
| Law root / preamble | `63fz.document` | `63fz.document` |
| Article | `63fz.article_<number>` with `.` → `_` | Статья 14.1 → `63fz.article_14_1` |
| Part (часть, `dt-m1` marker) | `<article>.part_<slug>` | `63fz.article_5.part_2` |
| Point (пункт, `dt-m2` marker) | `<parent>.point_<slug>` | `63fz.article_5.part_2.point_1` |
| Paragraph (unmarked text) | `<parent>.paragraph_<n>` | `63fz.article_2.paragraph_3` |

Parent chain: a part's parent is its article; a point's parent is the current part (or the article
if there is no part); a paragraph's parent is the current part (or the article).

Marker slug rules (`slugifyMarker`):

1. Trailing `.` and `)` are stripped from the marker (`2.` → `2`, `а)` → `а`).
2. Lowercased.
3. Cyrillic letters map to `ru<N>`, where `N` is the 1-based index in
   `абвгдеёжзийклмнопрстуфхцчшщъыьэюя` (`а)` → `ru1`, `б)` → `ru2`).
4. Any remaining non-alphanumeric runs become `_`; leading/trailing `_` are trimmed.

Paragraph numbering: paragraphs without an official marker get a sequential index that starts at 1
for each article and increments across the whole article (it does **not** reset per part).

## Invariants — do not break these

1. **Same legal unit ⇒ same stableId in every version.** The parser must be deterministic given the
   same logical structure. Any change to generation rules re-identifies fragments and silently
   corrupts history: old IDs look `deleted`, new IDs look `introduced`, and stored change
   explanations and feedback stop matching anything.
2. **Never rename existing generated IDs.** If a generation change is ever unavoidable, it requires
   a data migration for `LawFragment.stableId`/`anchor`, `FragmentChangeExplanation.stableId`, and
   `ChangeFeedback.stableId` in the same release, plus a re-import verification pass.
3. **Positional paragraph IDs are a known weakness.** Inserting or removing an unmarked paragraph
   in a new revision shifts the indexes of all following paragraphs in that article, producing
   misleading `changed`/`deleted` history entries for them. This is an accepted trade-off; do not
   "fix" it casually — any fix is a generation change and falls under invariant 2.
4. **Verify identity stability after any parser change.** Run `pnpm law:import:63fz -- --dry-run`
   against the same source and read the report's `comparison` block: a burst of `added`/`deleted`
   while the law text has not materially changed is the signature of broken identity, not of a real
   amendment. Duplicate-stableId warnings in the report are always a bug.
