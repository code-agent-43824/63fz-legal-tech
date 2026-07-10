"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  readContentKind,
  readIssueSeverity,
  readIssueStatus,
  readIssueType,
  readOptionalShortText,
  readPublicationStatus,
  readRecordId,
  readRequiredText,
  readRevisionStatus,
  requireDeleteConfirmation,
} from "@/lib/admin-validation";
import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function createContent(formData: FormData) {
  await requireAdmin();
  const fragmentId = readRecordId(formData, "fragmentId");
  const kind = readContentKind(formData);

  ensureDatabase();

  switch (kind) {
    case "explanation":
      await prisma.plainExplanation.create({
        data: {
          fragmentId,
          text: readRequiredText(formData, "text"),
          status: readPublicationStatus(formData),
          authorName: readOptionalShortText(formData, "authorName"),
        },
      });
      break;
    case "comment":
      await prisma.expertComment.create({
        data: {
          fragmentId,
          expertName: readRequiredText(formData, "expertName", 300),
          expertTitle: readOptionalShortText(formData, "expertTitle"),
          text: readRequiredText(formData, "text"),
          status: readPublicationStatus(formData),
        },
      });
      break;
    case "issue":
      await prisma.issue.create({
        data: {
          fragmentId,
          type: readIssueType(formData),
          title: readRequiredText(formData, "title", 300),
          description: readRequiredText(formData, "description"),
          severity: readIssueSeverity(formData),
          status: readIssueStatus(formData),
        },
      });
      break;
    case "revision":
      await prisma.proposedRevision.create({
        data: {
          fragmentId,
          originalText: readRequiredText(formData, "originalText"),
          proposedText: readRequiredText(formData, "proposedText"),
          rationale: readRequiredText(formData, "rationale"),
          status: readRevisionStatus(formData),
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
  const fragmentId = readRecordId(formData, "fragmentId");
  const id = readRecordId(formData, "id");
  const kind = readContentKind(formData);

  ensureDatabase();

  switch (kind) {
    case "explanation":
      await prisma.plainExplanation.update({
        where: { id },
        data: {
          text: readRequiredText(formData, "text"),
          status: readPublicationStatus(formData),
          authorName: readOptionalShortText(formData, "authorName"),
        },
      });
      break;
    case "comment":
      await prisma.expertComment.update({
        where: { id },
        data: {
          expertName: readRequiredText(formData, "expertName", 300),
          expertTitle: readOptionalShortText(formData, "expertTitle"),
          text: readRequiredText(formData, "text"),
          status: readPublicationStatus(formData),
        },
      });
      break;
    case "issue":
      await prisma.issue.update({
        where: { id },
        data: {
          type: readIssueType(formData),
          title: readRequiredText(formData, "title", 300),
          description: readRequiredText(formData, "description"),
          severity: readIssueSeverity(formData),
          status: readIssueStatus(formData),
        },
      });
      break;
    case "revision":
      await prisma.proposedRevision.update({
        where: { id },
        data: {
          originalText: readRequiredText(formData, "originalText"),
          proposedText: readRequiredText(formData, "proposedText"),
          rationale: readRequiredText(formData, "rationale"),
          status: readRevisionStatus(formData),
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
  requireDeleteConfirmation(formData);
  const fragmentId = readRecordId(formData, "fragmentId");
  const id = readRecordId(formData, "id");
  const kind = readContentKind(formData);

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
