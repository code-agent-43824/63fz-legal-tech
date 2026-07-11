import { normalizeForComparison } from "@/lib/change-history";

export type DiffSegment = {
  text: string;
  changed: boolean;
};

export type TextDiffSummary = {
  beforeSegments: DiffSegment[];
  afterSegments: DiffSegment[];
  beforeSnippet: string;
  afterSnippet: string;
};

export function buildTextDiffSummary(before: string, after: string): TextDiffSummary {
  const beforeWords = normalizeWords(before);
  const afterWords = normalizeWords(after);
  let start = 0;
  while (
    start < beforeWords.length &&
    start < afterWords.length &&
    beforeWords[start] === afterWords[start]
  ) {
    start += 1;
  }

  let beforeEnd = beforeWords.length - 1;
  let afterEnd = afterWords.length - 1;
  while (
    beforeEnd >= start &&
    afterEnd >= start &&
    beforeWords[beforeEnd] === afterWords[afterEnd]
  ) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  return {
    beforeSegments: excerptSegments(beforeWords, start, beforeEnd),
    afterSegments: excerptSegments(afterWords, start, afterEnd),
    beforeSnippet: segmentsToText(excerptSegments(beforeWords, start, beforeEnd)),
    afterSnippet: segmentsToText(excerptSegments(afterWords, start, afterEnd)),
  };
}

export function buildFullTextSnippet(value: string) {
  const words = normalizeWords(value);
  return segmentsToText(excerptSegments(words, 0, Math.min(words.length - 1, 40)));
}

function normalizeWords(value: string) {
  return normalizeForComparison(value).split(" ").filter(Boolean);
}

function excerptSegments(words: string[], start: number, end: number): DiffSegment[] {
  if (words.length === 0) {
    return [];
  }

  const safeStart = Math.max(0, Math.min(start, words.length - 1) - 8);
  const safeEnd = Math.min(words.length - 1, Math.max(end, start) + 8);
  const segments: DiffSegment[] = [];

  if (safeStart > 0) {
    segments.push({ text: "...", changed: false });
  }

  const prefixEnd = Math.min(start - 1, safeEnd);
  if (safeStart <= prefixEnd) {
    segments.push({ text: words.slice(safeStart, prefixEnd + 1).join(" "), changed: false });
  }

  const changedStart = Math.max(start, safeStart);
  const changedEnd = Math.min(end, safeEnd);
  if (changedStart <= changedEnd) {
    segments.push({ text: words.slice(changedStart, changedEnd + 1).join(" "), changed: true });
  }

  const suffixStart = Math.max(end + 1, safeStart);
  if (suffixStart <= safeEnd) {
    segments.push({ text: words.slice(suffixStart, safeEnd + 1).join(" "), changed: false });
  }

  if (safeEnd < words.length - 1) {
    segments.push({ text: "...", changed: false });
  }

  return segments.filter((segment) => segment.text.length > 0);
}

function segmentsToText(segments: DiffSegment[]) {
  return segments.map((segment) => segment.text).join(" ");
}
