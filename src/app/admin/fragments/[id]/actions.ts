"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ContentKind = "explanation" | "comment" | "issue" | "revision";

export async function createContent(formData: FormData) {
  await requireAdmin();
  const fragmentId = readRequired(formData, "fragmentId");
  const kind = readRequired(formData, "kind") as ContentKind;

  ensureDatabase();

  switch (kind) {
    case "explanation":
      await prisma.plainExplanation.create({
        data: {
          fragmentId,
          text: readRequired(formData, "text"),
          status: readStatus(formData),
          authorName: readOptional(formData, "authorName"),
        },
      });
      break;
    case "comment":
      await prisma.expertComment.create({
        data: {
          fragmentId,
          expertName: readRequired(formData, "expertName"),
          expertTitle: readOptional(formData, "expertTitle"),
          text: readRequired(formData, "text"),
          status: readStatus(formData),
        },
      });
      break;
    case "issue":
      await prisma.issue.create({
        data: {
          fragmentId,
          type: readRequired(formData, "type") as never,
          title: readRequired(formData, "title"),
          description: readRequired(formData, "description"),
          severity: readRequired(formData, "severity") as never,
          status: readRequired(formData, "status") as never,
        },
      });
      break;
    case "revision":
      await prisma.proposedRevision.create({
        data: {
          fragmentId,
          originalText: readRequired(formData, "originalText"),
          proposedText: readRequired(formData, "proposedText"),
          rationale: readRequired(formData, "rationale"),
          status: readRequired(formData, "status") as never,
        },
      });
      break;
    default:
      throw new Error("Unsupported content kind");
  }

  revalidateFragment(fragmentId);
}

export async function updateContent(formData: FormData) {
  await requireAdmin();
  const fragmentId = readRequired(formData, "fragmentId");
  const id = readRequired(formData, "id");
  const kind = readRequired(formData, "kind") as ContentKind;

  ensureDatabase();

  switch (kind) {
    case "explanation":
      await prisma.plainExplanation.update({
        where: { id },
        data: {
          text: readRequired(formData, "text"),
          status: readStatus(formData),
          authorName: readOptional(formData, "authorName"),
        },
      });
      break;
    case "comment":
      await prisma.expertComment.update({
        where: { id },
        data: {
          expertName: readRequired(formData, "expertName"),
          expertTitle: readOptional(formData, "expertTitle"),
          text: readRequired(formData, "text"),
          status: readStatus(formData),
        },
      });
      break;
    case "issue":
      await prisma.issue.update({
        where: { id },
        data: {
          type: readRequired(formData, "type") as never,
          title: readRequired(formData, "title"),
          description: readRequired(formData, "description"),
          severity: readRequired(formData, "severity") as never,
          status: readRequired(formData, "status") as never,
        },
      });
      break;
    case "revision":
      await prisma.proposedRevision.update({
        where: { id },
        data: {
          originalText: readRequired(formData, "originalText"),
          proposedText: readRequired(formData, "proposedText"),
          rationale: readRequired(formData, "rationale"),
          status: readRequired(formData, "status") as never,
        },
      });
      break;
    default:
      throw new Error("Unsupported content kind");
  }

  revalidateFragment(fragmentId);
}

export async function deleteContent(formData: FormData) {
  await requireAdmin();
  const fragmentId = readRequired(formData, "fragmentId");
  const id = readRequired(formData, "id");
  const kind = readRequired(formData, "kind") as ContentKind;

  ensureDatabase();

  switch (kind) {
    case "explanation":
      await prisma.plainExplanation.delete({ where: { id } });
      break;
    case "comment":
      await prisma.expertComment.delete({ where: { id } });
      break;
    case "issue":
      await prisma.issue.delete({ where: { id } });
      break;
    case "revision":
      await prisma.proposedRevision.delete({ where: { id } });
      break;
    default:
      throw new Error("Unsupported content kind");
  }

  revalidateFragment(fragmentId);
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

function revalidateFragment(fragmentId: string) {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath(`/admin/fragments/${fragmentId}`);
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
