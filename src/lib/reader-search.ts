import type { ReaderData, ReaderFragment } from "@/lib/law-data";

export type ReaderSearchResult = {
  id: string;
  stableId: string;
  fragmentId: string;
  fragmentTitle: string;
  label: string;
  excerpt: string;
  kind: "law-text" | "editorial" | "change-history";
};

const MAX_RESULTS = 50;
const MAX_EXCERPT_LENGTH = 180;

export function buildReaderSearchResults(
  readerData: ReaderData,
  rawQuery: string,
): ReaderSearchResult[] {
  const query = normalizeSearchText(rawQuery);
  if (query.length < 2) {
    return [];
  }

  const results: ReaderSearchResult[] = [];
  for (const fragment of readerData.fragments) {
    pushLawTextResult(results, fragment, query);
    pushEditorialResults(results, fragment, query);
    pushChangeHistoryResults(results, fragment, query);

    if (results.length >= MAX_RESULTS) {
      break;
    }
  }

  return results.slice(0, MAX_RESULTS);
}

export function normalizeSearchText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("ru-RU");
}

function pushLawTextResult(
  results: ReaderSearchResult[],
  fragment: ReaderFragment,
  query: string,
) {
  const haystack = `${fragment.title} ${fragment.stableId} ${fragment.text}`;
  if (!matches(haystack, query)) {
    return;
  }

  results.push({
    id: `${fragment.stableId}:law-text`,
    stableId: fragment.stableId,
    fragmentId: fragment.id,
    fragmentTitle: fragment.title,
    label: "Текст закона",
    excerpt: excerptAroundMatch(fragment.text || fragment.title, query),
    kind: "law-text",
  });
}

function pushEditorialResults(
  results: ReaderSearchResult[],
  fragment: ReaderFragment,
  query: string,
) {
  for (const block of fragment.blocks) {
    const haystack = `${block.title} ${block.text}`;
    if (!matches(haystack, query)) {
      continue;
    }

    results.push({
      id: `${fragment.stableId}:editorial:${block.title}`,
      stableId: fragment.stableId,
      fragmentId: fragment.id,
      fragmentTitle: fragment.title,
      label: block.title,
      excerpt: excerptAroundMatch(block.text, query),
      kind: "editorial",
    });
  }
}

function pushChangeHistoryResults(
  results: ReaderSearchResult[],
  fragment: ReaderFragment,
  query: string,
) {
  for (const entry of fragment.changeHistory) {
    const sourceText = entry.sourceLinks.map((link) => `${link.label} ${link.href}`).join(" ");
    const haystack = [
      entry.previousVersionLabel,
      entry.versionLabel,
      entry.reason,
      entry.purpose,
      entry.practicalMeaning,
      entry.beforeSnippet,
      entry.afterSnippet,
      sourceText,
    ].join(" ");
    if (!matches(haystack, query)) {
      continue;
    }

    results.push({
      id: `${fragment.stableId}:change:${entry.fromVersionId}:${entry.toVersionId}`,
      stableId: fragment.stableId,
      fragmentId: fragment.id,
      fragmentTitle: fragment.title,
      label: "История изменений",
      excerpt: excerptAroundMatch(haystack, query),
      kind: "change-history",
    });
  }
}

function matches(value: string, query: string) {
  return normalizeSearchText(value).includes(query);
}

function excerptAroundMatch(value: string, query: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  const lower = compact.toLocaleLowerCase("ru-RU");
  const index = lower.indexOf(query);
  if (index < 0) {
    return truncate(compact);
  }

  const start = Math.max(0, index - 60);
  const end = Math.min(compact.length, index + query.length + 90);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < compact.length ? "..." : "";
  return `${prefix}${compact.slice(start, end)}${suffix}`;
}

function truncate(value: string) {
  if (value.length <= MAX_EXCERPT_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_EXCERPT_LENGTH - 3)}...`;
}
