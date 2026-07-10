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
import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidatePublicReaderCache } from "@/lib/reader-cache";

export async function saveChangeExplanation(formData: FormData) {
  await requireAdmin();
  ensureDatabase();

  const stableId = readStableId(formData, "stableId");
  const fromVersionId = readRecordId(formData, "fromVersionId");
  const toVersionId = readRecordId(formData, "toVersionId");
  const status = readPublicationStatus(formData);
  const reason = readOptionalText(formData, "reason");
  const purpose = readOptionalText(formData, "purpose");
  const practicalMeaning = readOptionalText(formData, "practicalMeaning");
  const sourceLinks = readOptionalSourceLinks(formData, "sourceLinks");

  await prisma.fragmentChangeExplanation.upsert({
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

  await revalidateChanges();
}

export async function deleteChangeExplanation(formData: FormData) {
  await requireAdmin();
  ensureDatabase();

  requireDeleteConfirmation(formData);
  const id = readRecordId(formData, "id");
  await prisma.fragmentChangeExplanation.delete({ where: { id } });

  await revalidateChanges();
}

async function requireAdmin() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }
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
