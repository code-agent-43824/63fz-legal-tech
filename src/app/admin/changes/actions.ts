"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function saveChangeExplanation(formData: FormData) {
  await requireAdmin();
  ensureDatabase();

  const stableId = readRequired(formData, "stableId");
  const fromVersionId = readRequired(formData, "fromVersionId");
  const toVersionId = readRequired(formData, "toVersionId");

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
      reason: readOptional(formData, "reason"),
      purpose: readOptional(formData, "purpose"),
      practicalMeaning: readOptional(formData, "practicalMeaning"),
      sourceLinks: readOptional(formData, "sourceLinks"),
      status: readStatus(formData),
    },
    update: {
      reason: readOptional(formData, "reason"),
      purpose: readOptional(formData, "purpose"),
      practicalMeaning: readOptional(formData, "practicalMeaning"),
      sourceLinks: readOptional(formData, "sourceLinks"),
      status: readStatus(formData),
    },
  });

  revalidateChanges();
}

export async function deleteChangeExplanation(formData: FormData) {
  await requireAdmin();
  ensureDatabase();

  const id = readRequired(formData, "id");
  await prisma.fragmentChangeExplanation.delete({ where: { id } });

  revalidateChanges();
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

function revalidateChanges() {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/changes");
}

function readRequired(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

function readOptional(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function readStatus(formData: FormData) {
  return readRequired(formData, "status") as "draft" | "published";
}
