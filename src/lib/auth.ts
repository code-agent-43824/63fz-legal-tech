import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import {
  getAuthConfigurationIssueForValues,
  isValidAdminPassword,
  isValidAuthSecret,
} from "@/lib/auth-policy";
import { getCookieBasePath } from "@/lib/base-path";
import { verifyEditorialPassword } from "@/lib/editorial-password";
import {
  normalizeEditorialUsername,
  type EditorialActor,
} from "@/lib/editorial-policy";
import { prisma } from "@/lib/prisma";

const ADMIN_COOKIE = "admin_session";
const COOKIE_PATH = getCookieBasePath();
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

export async function getCurrentEditorialActor(): Promise<EditorialActor | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_COOKIE)?.value;

  if (!session) {
    return null;
  }

  const payload = verifySession(session);
  if (!payload) {
    return null;
  }

  if (payload.kind === "env-admin") {
    return {
      kind: "env-admin",
      id: null,
      role: "admin",
      displayName: "Администратор",
      professionalTitle: null,
    };
  }

  const user = await prisma.editorialUser.findUnique({ where: { id: payload.userId } });
  if (!user || user.status !== "active") {
    return null;
  }

  return {
    kind: "user",
    id: user.id,
    role: user.role,
    displayName: user.displayName,
    professionalTitle: user.professionalTitle,
  };
}

export async function createAdminSession() {
  await createSession({ kind: "env-admin" });
}

export async function createEditorialUserSession(userId: string) {
  await createSession({ kind: "user", userId });
}

async function createSession(subject: SessionSubject) {
  const cookieStore = await cookies();
  const value = signSession(subject);

  cookieStore.set(ADMIN_COOKIE, value, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function authenticateEditorialUser(username: string, password: string) {
  const normalizedUsername = normalizeEditorialUsername(username);
  if (!normalizedUsername || !process.env.DATABASE_URL) {
    return null;
  }

  const user = await prisma.editorialUser.findUnique({ where: { username: normalizedUsername } });
  if (!user || user.status !== "active" || !(await verifyEditorialPassword(password, user.passwordHash))) {
    return null;
  }

  await prisma.editorialUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return user;
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
  return getAuthConfigurationIssueForValues({
    adminPassword: process.env.ADMIN_PASSWORD,
    authSecret: process.env.AUTH_SECRET,
  });
}

type SessionSubject = { kind: "env-admin" } | { kind: "user"; userId: string };

type SessionPayload =
  | { kind: "env-admin"; createdAt: number }
  | { kind: "user"; userId: string; createdAt: number };

function signSession(subject: SessionSubject) {
  const payload = JSON.stringify({
    ...subject,
    createdAt: Date.now(),
  });
  const encodedPayload = Buffer.from(payload).toString("base64url");
  const signature = sign(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

function verifySession(value: string): SessionPayload | null {
  const [payload, signature] = value.split(".");

  if (!payload || !signature) {
    return null;
  }

  if (!safeEqual(signature, sign(payload))) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      kind?: string;
      userId?: string;
      subject?: string;
      createdAt?: number;
    };

    if (!Number.isFinite(decoded.createdAt) || Date.now() - Number(decoded.createdAt) >= SESSION_MAX_AGE_MS) {
      return null;
    }
    if (decoded.subject === "admin" || decoded.kind === "env-admin") {
      return { kind: "env-admin", createdAt: Number(decoded.createdAt) };
    }
    if (decoded.kind === "user" && typeof decoded.userId === "string" && decoded.userId) {
      return { kind: "user", userId: decoded.userId, createdAt: Number(decoded.createdAt) };
    }
    return null;
  } catch {
    return null;
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
