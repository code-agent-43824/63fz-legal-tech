import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const ADMIN_COOKIE = "admin_session";
const COOKIE_PATH = "/63fz";
const ADMIN_PASSWORD_EXAMPLES = new Set(["change-me", "password", "admin", "admin123"]);
const AUTH_SECRET_EXAMPLES = new Set([
  "change-me-at-least-32-characters",
  "development-only-auth-secret-change-before-production",
]);
const MIN_ADMIN_PASSWORD_LENGTH = 12;
const MIN_AUTH_SECRET_LENGTH = 32;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

type LoginBucket = {
  count: number;
  lockedUntil: number;
  windowStartedAt: number;
};

const loginBuckets = new Map<string, LoginBucket>();

export async function isAdminAuthenticated() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_COOKIE)?.value;

  if (!session) {
    return false;
  }

  return verifySession(session);
}

export async function createAdminSession() {
  const cookieStore = await cookies();
  const value = signSession("admin");

  cookieStore.set(ADMIN_COOKIE, value, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: 0,
  });
}

export function verifyAdminPassword(password: string) {
  const configuredPassword = process.env.ADMIN_PASSWORD;

  if (!isValidAdminPassword(configuredPassword)) {
    return false;
  }

  return safeEqual(password, configuredPassword);
}

export function checkAdminLoginRateLimit(key: string) {
  const normalizedKey = normalizeRateLimitKey(key);
  const now = Date.now();
  const bucket = loginBuckets.get(normalizedKey);

  if (!bucket) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((bucket.lockedUntil - now) / 1000),
    };
  }

  if (now - bucket.windowStartedAt > LOGIN_WINDOW_MS) {
    loginBuckets.delete(normalizedKey);
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordAdminLoginFailure(key: string) {
  const normalizedKey = normalizeRateLimitKey(key);
  const now = Date.now();
  const current = loginBuckets.get(normalizedKey);
  const bucket =
    current && now - current.windowStartedAt <= LOGIN_WINDOW_MS
      ? current
      : { count: 0, lockedUntil: 0, windowStartedAt: now };

  bucket.count += 1;
  if (bucket.count >= LOGIN_MAX_ATTEMPTS) {
    bucket.lockedUntil = now + LOGIN_LOCK_MS;
  }

  loginBuckets.set(normalizedKey, bucket);
}

export function recordAdminLoginSuccess(key: string) {
  loginBuckets.delete(normalizeRateLimitKey(key));
}

export function getAuthConfigurationIssue() {
  const authSecret = process.env.AUTH_SECRET;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!isValidAuthSecret(authSecret)) {
    return `AUTH_SECRET must be set, non-example, and at least ${MIN_AUTH_SECRET_LENGTH} characters.`;
  }

  if (!isValidAdminPassword(adminPassword)) {
    return `ADMIN_PASSWORD must be set, non-example, and at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`;
  }

  return null;
}

function signSession(subject: string) {
  const payload = JSON.stringify({
    subject,
    createdAt: Date.now(),
  });
  const encodedPayload = Buffer.from(payload).toString("base64url");
  const signature = sign(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

function verifySession(value: string) {
  const [payload, signature] = value.split(".");

  if (!payload || !signature) {
    return false;
  }

  if (!safeEqual(signature, sign(payload))) {
    return false;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      subject?: string;
      createdAt?: number;
    };

    return decoded.subject === "admin" && Date.now() - Number(decoded.createdAt) < SESSION_MAX_AGE_MS;
  } catch {
    return false;
  }
}

function sign(value: string) {
  const secret = getAuthSecret();
  if (!secret) {
    throw new Error("AUTH_SECRET is required for admin sessions.");
  }

  return createHmac("sha256", secret).update(value).digest("base64url");
}

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!isValidAuthSecret(secret)) {
    return null;
  }

  return secret;
}

function isValidAuthSecret(secret: string | undefined): secret is string {
  return Boolean(
    secret &&
      secret.length >= MIN_AUTH_SECRET_LENGTH &&
      !AUTH_SECRET_EXAMPLES.has(secret) &&
      !/change[-_ ]?me/i.test(secret),
  );
}

function isValidAdminPassword(password: string | undefined): password is string {
  return Boolean(
    password &&
      password.length >= MIN_ADMIN_PASSWORD_LENGTH &&
      !ADMIN_PASSWORD_EXAMPLES.has(password.toLowerCase()) &&
      !/change[-_ ]?me/i.test(password),
  );
}

function normalizeRateLimitKey(key: string) {
  const normalized = key.trim().toLowerCase();
  return normalized || "unknown";
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
