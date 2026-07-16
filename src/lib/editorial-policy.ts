export const EDITORIAL_USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,49}$/;

export type EditorialActor =
  | {
      kind: "env-admin";
      id: null;
      role: "admin";
      displayName: "Администратор";
      professionalTitle: null;
    }
  | {
      kind: "user";
      id: string;
      role: "admin" | "expert";
      displayName: string;
      professionalTitle: string | null;
    };

export type EditorialContentKind = "explanation" | "comment" | "issue" | "revision";

export function normalizeEditorialUsername(username: string) {
  return username.trim().toLowerCase();
}

export function assertEditorialUsername(username: string) {
  const normalized = normalizeEditorialUsername(username);
  if (!EDITORIAL_USERNAME_PATTERN.test(normalized) || normalized === "admin") {
    throw new Error("Username must be 3-50 latin letters, digits, dots, hyphens or underscores and cannot be admin");
  }
  return normalized;
}

export function canCreateEditorialContent(actor: EditorialActor, kind: EditorialContentKind) {
  return actor.role === "admin" || kind === "explanation" || kind === "comment";
}

export function canEditEditorialContent(
  actor: EditorialActor,
  kind: EditorialContentKind,
  authorId: string | null,
) {
  if (actor.role === "admin") {
    return true;
  }
  return (kind === "explanation" || kind === "comment") && authorId === actor.id;
}

export function canDeleteEditorialContent(actor: EditorialActor) {
  return actor.role === "admin";
}

export function canPublishEditorialContent(actor: EditorialActor) {
  return actor.role === "admin" || actor.role === "expert";
}
