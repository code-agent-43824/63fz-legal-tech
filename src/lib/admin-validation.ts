const PUBLICATION_STATUSES = ["draft", "published"] as const;
const CONTENT_KINDS = ["explanation", "comment", "issue", "revision"] as const;
const ISSUE_TYPES = [
  "typo",
  "contradiction",
  "ambiguity",
  "outdated_norm",
  "technical_error",
  "enforcement_problem",
  "other",
] as const;
const ISSUE_SEVERITIES = ["low", "medium", "high"] as const;
const ISSUE_STATUSES = ["hypothesis", "confirmed", "rejected", "fixed_in_proposal"] as const;
const REVISION_STATUSES = ["draft", "proposed", "accepted", "rejected"] as const;
const ID_PATTERN = /^[a-z0-9_.:-]+$/i;
const STABLE_ID_PATTERN = /^63fz(?:\.[a-z0-9_]+)+$/i;
const MAX_SHORT_TEXT_LENGTH = 300;
const MAX_LONG_TEXT_LENGTH = 10000;
const MAX_SOURCE_LINKS_LENGTH = 3000;

export type ContentKind = (typeof CONTENT_KINDS)[number];

export function readContentKind(formData: FormData) {
  return readEnum(formData, "kind", CONTENT_KINDS);
}

export function readPublicationStatus(formData: FormData) {
  return readEnum(formData, "status", PUBLICATION_STATUSES);
}

export function readIssueType(formData: FormData) {
  return readEnum(formData, "type", ISSUE_TYPES);
}

export function readIssueSeverity(formData: FormData) {
  return readEnum(formData, "severity", ISSUE_SEVERITIES);
}

export function readIssueStatus(formData: FormData) {
  return readEnum(formData, "status", ISSUE_STATUSES);
}

export function readRevisionStatus(formData: FormData) {
  return readEnum(formData, "status", REVISION_STATUSES);
}

export function readRecordId(formData: FormData, key: string) {
  const value = readRequired(formData, key, MAX_SHORT_TEXT_LENGTH);
  if (!ID_PATTERN.test(value)) {
    throw new Error(`${key} has invalid characters`);
  }
  return value;
}

export function readStableId(formData: FormData, key: string) {
  const value = readRequired(formData, key, MAX_SHORT_TEXT_LENGTH);
  if (!STABLE_ID_PATTERN.test(value)) {
    throw new Error(`${key} has invalid stable ID format`);
  }
  return value;
}

export function readRequiredText(formData: FormData, key: string, maxLength = MAX_LONG_TEXT_LENGTH) {
  return readRequired(formData, key, maxLength);
}

export function readOptionalText(formData: FormData, key: string, maxLength = MAX_LONG_TEXT_LENGTH) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) {
    return null;
  }
  assertMaxLength(value, key, maxLength);
  return value;
}

export function readOptionalShortText(formData: FormData, key: string) {
  return readOptionalText(formData, key, MAX_SHORT_TEXT_LENGTH);
}

export function readOptionalSourceLinks(formData: FormData, key: string) {
  const value = readOptionalText(formData, key, MAX_SOURCE_LINKS_LENGTH);
  if (!value) {
    return null;
  }
  validateSourceLinkText(value, key);
  return value;
}

export function requireDeleteConfirmation(formData: FormData) {
  if (String(formData.get("confirmDelete") ?? "") !== "yes") {
    throw new Error("Delete confirmation is required");
  }
}

function readEnum<const T extends readonly string[]>(formData: FormData, key: string, values: T) {
  const value = readRequired(formData, key, MAX_SHORT_TEXT_LENGTH);
  if (!values.includes(value)) {
    throw new Error(`${key} has unsupported value`);
  }
  return value as T[number];
}

function readRequired(formData: FormData, key: string, maxLength: number) {
  const value = String(formData.get(key) ?? "").trim();

  if (!value) {
    throw new Error(`${key} is required`);
  }

  assertMaxLength(value, key, maxLength);
  return value;
}

function assertMaxLength(value: string, key: string, maxLength: number) {
  if (value.length > maxLength) {
    throw new Error(`${key} must be ${maxLength} characters or fewer`);
  }
}

function validateSourceLinkText(value: string, key: string) {
  const protocolMatches = value.match(/\b[a-z][a-z0-9+.-]*:\/\//gi) ?? [];
  for (const protocol of protocolMatches) {
    if (!protocol.toLowerCase().startsWith("https://")) {
      throw new Error(`${key} may only contain https:// links`);
    }
  }

  const urlMatches = value.match(/https:\/\/[^\s<>"')]+/gi) ?? [];
  for (const url of urlMatches) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") {
        throw new Error("invalid protocol");
      }
    } catch {
      throw new Error(`${key} contains an invalid URL`);
    }
  }
}
