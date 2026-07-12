"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { readRecordId, readStableId } from "@/lib/admin-validation";
import {
  createBoundedFeedbackRateLimiter,
  isFeedbackKind,
  validateChangeFeedbackTransition,
} from "@/lib/change-feedback";
import { prisma } from "@/lib/prisma";

const FEEDBACK_WINDOW_MS = 10 * 60 * 1000;
const FEEDBACK_LIMIT = 20;
const feedbackRateLimiter = createBoundedFeedbackRateLimiter({
  limit: FEEDBACK_LIMIT,
  maxBuckets: 1000,
  windowMs: FEEDBACK_WINDOW_MS,
});

export async function submitChangeFeedback(formData: FormData) {
  if (!process.env.DATABASE_URL) {
    return;
  }

  const stableId = readStableId(formData, "stableId");
  const fromVersionId = readRecordId(formData, "fromVersionId");
  const toVersionId = readRecordId(formData, "toVersionId");
  const kind = String(formData.get("kind") ?? "");
  if (!isFeedbackKind(kind)) {
    throw new Error("Feedback could not be saved.");
  }

  const clientHash = await getClientHash();
  if (!feedbackRateLimiter.enforce(clientHash)) {
    throw new Error("Please try again later.");
  }

  const isValidTransition = await validateFeedbackTransition({
    fromVersionId,
    kind,
    stableId,
    toVersionId,
  });
  if (!isValidTransition) {
    throw new Error("Feedback could not be saved.");
  }

  try {
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
  } catch {
    throw new Error("Feedback could not be saved.");
  }
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

async function validateFeedbackTransition({
  fromVersionId,
  kind,
  stableId,
  toVersionId,
}: {
  fromVersionId: string;
  kind: string;
  stableId: string;
  toVersionId: string;
}) {
  const [versions, fragments] = await Promise.all([
    prisma.lawVersion.findMany({
      where: {
        OR: [{ id: fromVersionId }, { id: toVersionId }],
      },
      select: {
        createdAt: true,
        effectiveDate: true,
        id: true,
        lawId: true,
        status: true,
      },
    }),
    prisma.lawFragment.findMany({
      where: {
        stableId,
        lawVersionId: { in: [fromVersionId, toVersionId] },
      },
      select: {
        lawVersionId: true,
        stableId: true,
        text: true,
      },
    }),
  ]);
  const fromVersion = versions.find((version) => version.id === fromVersionId) ?? null;
  const toVersion = versions.find((version) => version.id === toVersionId) ?? null;
  const publicVersions =
    fromVersion && toVersion && fromVersion.lawId === toVersion.lawId
      ? await prisma.lawVersion.findMany({
          where: {
            lawId: fromVersion.lawId,
            status: { in: ["published", "archived"] },
          },
          orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
          select: {
            createdAt: true,
            effectiveDate: true,
            id: true,
            lawId: true,
            status: true,
          },
        })
      : [];

  const result = validateChangeFeedbackTransition({
    fragments,
    fromVersion,
    kind,
    publicVersions,
    stableId,
    toVersion,
  });

  return result.ok;
}
