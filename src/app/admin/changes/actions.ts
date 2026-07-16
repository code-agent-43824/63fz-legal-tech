"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  readOptionalSourceLinks,
  readOptionalText,
  readPublicationStatus,
  readRecordId,
  readStableId,
  requireDeleteConfirmation,
} from "@/lib/admin-validation";
import { getCurrentEditorialActor } from "@/lib/auth";
import { recordEditorialAudit } from "@/lib/editorial-audit";
import type { EditorialActor } from "@/lib/editorial-policy";
import { prisma } from "@/lib/prisma";
import { invalidatePublicReaderCache } from "@/lib/reader-cache";
import { withBasePath } from "@/lib/base-path";

export async function saveChangeExplanation(formData: FormData) {
  const actor = await requireAdmin();
  ensureDatabase();

  const stableId = readStableId(formData, "stableId");
  const fromVersionId = readRecordId(formData, "fromVersionId");
  const toVersionId = readRecordId(formData, "toVersionId");
  const status = readPublicationStatus(formData);
  const reason = readOptionalText(formData, "reason");
  const purpose = readOptionalText(formData, "purpose");
  const practicalMeaning = readOptionalText(formData, "practicalMeaning");
  const sourceLinks = readOptionalSourceLinks(formData, "sourceLinks");

  const explanation = await prisma.fragmentChangeExplanation.upsert({
    where: {
      stableId_fromVersionId_toVersionId: {
        stableId,
        fromVersionId,
        toVersionId,
      },
    },
    create: {
      stableId,
      fromVersionId,
      toVersionId,
      reason,
      purpose,
      practicalMeaning,
      sourceLinks,
      status,
    },
    update: {
      reason,
      purpose,
      practicalMeaning,
      sourceLinks,
      status,
    },
  });
  await recordEditorialAudit({ actor, action: "change-explanation.save", entityType: "change-explanation", entityId: explanation.id, details: { stableId, fromVersionId, toVersionId } });

  await revalidateChanges();
}

export async function deleteChangeExplanation(formData: FormData) {
  const actor = await requireAdmin();
  ensureDatabase();

  requireDeleteConfirmation(formData);
  const id = readRecordId(formData, "id");
  await prisma.fragmentChangeExplanation.delete({ where: { id } });
  await recordEditorialAudit({ actor, action: "change-explanation.delete", entityType: "change-explanation", entityId: id });

  await revalidateChanges();
}

async function requireAdmin(): Promise<EditorialActor> {
  const actor = await getCurrentEditorialActor();
  if (!actor) {
    redirect(withBasePath("/admin/login"));
  }
  if (actor.role !== "admin") redirect(withBasePath("/admin"));
  return actor;
}

function ensureDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for admin writes");
  }
}

async function revalidateChanges() {
  await invalidatePublicReaderCache();
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/changes");
}
