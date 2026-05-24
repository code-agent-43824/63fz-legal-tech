import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const ADMIN_COOKIE = "admin_session";
const COOKIE_PATH = "/63fz";

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
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: 60 * 60 * 8,
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE);
}

export function verifyAdminPassword(password: string) {
  const configuredPassword = process.env.ADMIN_PASSWORD;

  if (!configuredPassword || configuredPassword === "change-me") {
    return false;
  }

  return safeEqual(password, configuredPassword);
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

    const maxAgeMs = 1000 * 60 * 60 * 8;
    return decoded.subject === "admin" && Date.now() - Number(decoded.createdAt) < maxAgeMs;
  } catch {
    return false;
  }
}

function sign(value: string) {
  return createHmac("sha256", getAuthSecret()).update(value).digest("base64url");
}

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret === "change-me-at-least-32-characters") {
    return "development-only-auth-secret-change-before-production";
  }

  return secret;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
