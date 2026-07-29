// Structured references from the official 63-FZ text to other federal laws.
//
// Everything here is extracted from the official law text itself: the number, the date, and the
// act title when the text states it in quotes. Nothing is looked up, guessed, or completed from
// outside knowledge, so a reference can never claim more than the official wording does.
//
// No external URL is generated. The official portal (publication.pravo.gov.ru) does not answer
// over HTTPS from the deployment environment, and `makeSafeSourceLink` deliberately accepts only
// `https:`. Rendering an unverified or plain-HTTP link as an official reference would be worse
// than rendering none, so links stay the editors' job through the existing source-link fields.

export type LawReference = {
  /** Stable key for React lists and anchors, derived from the law number. */
  id: string;
  /** Normalized law number as printed in the official text, e.g. "149-ФЗ". */
  number: string;
  /** ISO date when the official text gives a parseable date, otherwise null. */
  date: string | null;
  /** Date exactly as printed in the official text. */
  dateLabel: string;
  /** Official act title when the text quotes it, otherwise null. */
  title: string | null;
};

const MONTHS: Record<string, string> = {
  января: "01",
  февраля: "02",
  марта: "03",
  апреля: "04",
  мая: "05",
  июня: "06",
  июля: "07",
  августа: "08",
  сентября: "09",
  октября: "10",
  ноября: "11",
  декабря: "12",
};

// "Федеральным законом от 27 июля 2006 года N 149-ФЗ "Об информации ..."" and the shorter
// "Федерального закона от 04.08.2023 N 457-ФЗ" both appear in the imported text.
const REFERENCE_PATTERN = new RegExp(
  [
    "Федеральн(?:ый|ым|ого|ом|ому)\\s+закон(?:ом|а|е|у)?",
    "\\s+от\\s+",
    "(\\d{1,2}\\s+[а-яё]+\\s+\\d{4}\\s*года|\\d{2}\\.\\d{2}\\.\\d{4})",
    "\\s*N\\s*",
    "(\\d+(?:\\.\\d+)?-ФЗ)",
    "(?:\\s*[«\"]([^»\"]{3,400})[»\"])?",
  ].join(""),
  "gi",
);

/**
 * Extracts references to other federal laws from one piece of official law text.
 *
 * Self-references ("настоящий Федеральный закон", 63-ФЗ) are excluded: they point at the document
 * the reader is already in. Results are deduplicated by law number, keeping the first occurrence
 * that carries a title so the richest wording wins.
 */
export function extractLawReferences(text: string, selfNumber = "63-ФЗ"): LawReference[] {
  if (!text) {
    return [];
  }

  const byNumber = new Map<string, LawReference>();

  for (const match of text.matchAll(REFERENCE_PATTERN)) {
    const dateLabel = normalizeSpaces(match[1]);
    const number = match[2].toUpperCase();
    const title = match[3] ? normalizeSpaces(match[3]) : null;

    if (number === selfNumber.toUpperCase()) {
      continue;
    }

    const reference: LawReference = {
      id: toReferenceId(number),
      number,
      date: parseReferenceDate(dateLabel),
      dateLabel,
      title,
    };

    const existing = byNumber.get(number);
    if (!existing) {
      byNumber.set(number, reference);
      continue;
    }

    // Prefer the occurrence that states the official title.
    if (!existing.title && reference.title) {
      byNumber.set(number, reference);
    }
  }

  return [...byNumber.values()].sort(compareReferences);
}

export function formatLawReferenceLabel(reference: LawReference) {
  return reference.title
    ? `${reference.number} «${reference.title}»`
    : `${reference.number} от ${reference.dateLabel}`;
}

function compareReferences(left: LawReference, right: LawReference) {
  const leftNumber = Number.parseFloat(left.number);
  const rightNumber = Number.parseFloat(right.number);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return left.number.localeCompare(right.number, "ru");
}

function toReferenceId(number: string) {
  return `law-${number.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "-").replace(/^-+|-+$/g, "")}`;
}

function parseReferenceDate(dateLabel: string) {
  const dotted = dateLabel.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dotted) {
    return `${dotted[3]}-${dotted[2]}-${dotted[1]}`;
  }

  const spelled = dateLabel.match(/^(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
  if (spelled) {
    const month = MONTHS[spelled[2].toLowerCase()];
    if (month) {
      return `${spelled[3]}-${month}-${spelled[1].padStart(2, "0")}`;
    }
  }

  return null;
}

function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
