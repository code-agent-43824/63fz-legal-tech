"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { readRecordId, readStableId } from "@/lib/admin-validation";
import { prisma } from "@/lib/prisma";

const FEEDBACK_KINDS = new Set(["useful", "unclear", "error"]);
const recentFeedback = new Map<string, number[]>();
const FEEDBACK_WINDOW_MS = 10 * 60 * 1000;
const FEEDBACK_LIMIT = 20;

export async function submitChangeFeedback(formData: FormData) {
  if (!process.env.DATABASE_URL) {
    return;
  }

  const stableId = readStableId(formData, "stableId");
  const fromVersionId = readRecordId(formData, "fromVersionId");
  const toVersionId = readRecordId(formData, "toVersionId");
  const kind = String(formData.get("kind") ?? "");
  if (!FEEDBACK_KINDS.has(kind)) {
    throw new Error("Unsupported feedback kind");
  }

  const clientHash = await getClientHash();
  enforceFeedbackRateLimit(clientHash);

  await prisma.changeFeedback.upsert({
    where: {
      stableId_fromVersionId_toVersionId_kind_clientHash: {
        stableId,
        fromVersionId,
        toVersionId,
        kind,
        clientHash,
      },
    },
    create: {
      stableId,
      fromVersionId,
      toVersionId,
      kind,
      clientHash,
    },
    update: {},
  });
}

async function getClientHash() {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const realIp = requestHeaders.get("x-real-ip") ?? "";
  const userAgent = requestHeaders.get("user-agent") ?? "";
  const salt = process.env.AUTH_SECRET ?? "development-feedback-salt";
  return createHash("sha256")
    .update(`${salt}\n${forwardedFor || realIp}\n${userAgent}`)
    .digest("hex");
}

function enforceFeedbackRateLimit(clientHash: string) {
  const now = Date.now();
  const recent = (recentFeedback.get(clientHash) ?? []).filter(
    (timestamp) => now - timestamp < FEEDBACK_WINDOW_MS,
  );
  if (recent.length >= FEEDBACK_LIMIT) {
    throw new Error("Too many feedback submissions");
  }

  recent.push(now);
  recentFeedback.set(clientHash, recent);
}
