export const MIN_ADMIN_PASSWORD_LENGTH = 12;
export const MIN_AUTH_SECRET_LENGTH = 32;

const ADMIN_PASSWORD_EXAMPLES = new Set(["change-me", "password", "admin", "admin123"]);
const AUTH_SECRET_EXAMPLES = new Set([
  "change-me-at-least-32-characters",
  "development-only-auth-secret-change-before-production",
]);

export function isValidAuthSecret(secret: string | undefined): secret is string {
  return Boolean(
    secret &&
      secret.length >= MIN_AUTH_SECRET_LENGTH &&
      !AUTH_SECRET_EXAMPLES.has(secret) &&
      !/change[-_ ]?me/i.test(secret),
  );
}

export function isValidAdminPassword(password: string | undefined): password is string {
  return Boolean(
    password &&
      password.length >= MIN_ADMIN_PASSWORD_LENGTH &&
      !ADMIN_PASSWORD_EXAMPLES.has(password.toLowerCase()) &&
      !/change[-_ ]?me/i.test(password),
  );
}

export function getAuthConfigurationIssueForValues({
  adminPassword,
  authSecret,
}: {
  adminPassword: string | undefined;
  authSecret: string | undefined;
}) {
  if (!isValidAuthSecret(authSecret)) {
    return `AUTH_SECRET must be set, non-example, and at least ${MIN_AUTH_SECRET_LENGTH} characters.`;
  }

  if (!isValidAdminPassword(adminPassword)) {
    return `ADMIN_PASSWORD must be set, non-example, and at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`;
  }

  return null;
}
