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
import { getCurrentEditorialActor } from "@/lib/auth";
import { recordEditorialAudit } from "@/lib/editorial-audit";
import {
  canCreateEditorialContent,
  canDeleteEditorialContent,
  canEditEditorialContent,
  type EditorialActor,
} from "@/lib/editorial-policy";
import { prisma } from "@/lib/prisma";
import { invalidatePublicReaderCache } from "@/lib/reader-cache";
import { withBasePath } from "@/lib/base-path";

export async function createContent(formData: FormData) {
  const actor = await requireActor();
  const fragmentId = readRecordId(formData, "fragmentId");
  const kind = readContentKind(formData);
  if (!canCreateEditorialContent(actor, kind)) {
    throw new Error("Insufficient permissions for this content type");
  }

  ensureDatabase();

  let createdId: string;
  switch (kind) {
    case "explanation":
      createdId = (await prisma.plainExplanation.create({
        data: {
          fragmentId,
          text: readRequiredText(formData, "text"),
          status: readPublicationStatus(formData),
          authorName: actor.kind === "user" ? actor.displayName : readOptionalShortText(formData, "authorName"),
          authorId: actor.id,
        },
      })).id;
      break;
    case "comment":
      createdId = (await prisma.expertComment.create({
        data: {
          fragmentId,
          expertName: actor.kind === "user" ? actor.displayName : readRequiredText(formData, "expertName", 300),
          expertTitle: actor.kind === "user" ? actor.professionalTitle : readOptionalShortText(formData, "expertTitle"),
          authorId: actor.id,
          text: readRequiredText(formData, "text"),
          status: readPublicationStatus(formData),
        },
      })).id;
      break;
    case "issue":
      createdId = (await prisma.issue.create({
        data: {
          fragmentId,
          type: readIssueType(formData),
          title: readRequiredText(formData, "title", 300),
          description: readRequiredText(formData, "description"),
          severity: readIssueSeverity(formData),
          status: readIssueStatus(formData),
        },
      })).id;
      break;
    case "revision":
      createdId = (await prisma.proposedRevision.create({
        data: {
          fragmentId,
          originalText: readRequiredText(formData, "originalText"),
          proposedText: readRequiredText(formData, "proposedText"),
          rationale: readRequiredText(formData, "rationale"),
          status: readRevisionStatus(formData),
        },
      })).id;
      break;
    default:
      throw new Error("Unsupported content kind");
  }

  await recordEditorialAudit({ actor, action: "content.create", entityType: kind, entityId: createdId, details: { fragmentId, status: String(formData.get("status") ?? "") } });

  await revalidateFragment(fragmentId);
}

export async function updateContent(formData: FormData) {
  const actor = await requireActor();
  const fragmentId = readRecordId(formData, "fragmentId");
  const id = readRecordId(formData, "id");
  const kind = readContentKind(formData);

  ensureDatabase();
  const ownership = await getContentOwnership(kind, id, fragmentId);
  if (!canEditEditorialContent(actor, kind, ownership.authorId)) {
    throw new Error("You may only edit your own expert contributions");
  }

  switch (kind) {
    case "explanation":
      await prisma.plainExplanation.update({
        where: { id },
        data: {
          text: readRequiredText(formData, "text"),
          status: readPublicationStatus(formData),
          authorName: actor.kind === "user" ? actor.displayName : ownership.displayName ?? readOptionalShortText(formData, "authorName"),
        },
      });
      break;
    case "comment":
      await prisma.expertComment.update({
        where: { id },
        data: {
          expertName: actor.kind === "user" ? actor.displayName : ownership.displayName ?? readRequiredText(formData, "expertName", 300),
          expertTitle: actor.kind === "user" ? actor.professionalTitle : ownership.authorId ? ownership.professionalTitle : readOptionalShortText(formData, "expertTitle"),
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

  await recordEditorialAudit({ actor, action: "content.update", entityType: kind, entityId: id, details: { fragmentId, beforeStatus: ownership.status, afterStatus: String(formData.get("status") ?? "") } });

  await revalidateFragment(fragmentId);
}

export async function deleteContent(formData: FormData) {
  const actor = await requireActor();
  if (!canDeleteEditorialContent(actor)) {
    throw new Error("Only administrators may delete contributions");
  }
  requireDeleteConfirmation(formData);
  const fragmentId = readRecordId(formData, "fragmentId");
  const id = readRecordId(formData, "id");
  const kind = readContentKind(formData);

  ensureDatabase();
  const ownership = await getContentOwnership(kind, id, fragmentId);

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

  await recordEditorialAudit({ actor, action: "content.delete", entityType: kind, entityId: id, details: { fragmentId, status: ownership.status } });

  await revalidateFragment(fragmentId);
}

async function requireActor(): Promise<EditorialActor> {
  const actor = await getCurrentEditorialActor();
  if (!actor) {
    redirect(withBasePath("/admin/login"));
  }
  return actor;
}

async function getContentOwnership(kind: string, id: string, fragmentId: string) {
  switch (kind) {
    case "explanation": {
      const item = await prisma.plainExplanation.findUnique({ where: { id }, select: { authorId: true, fragmentId: true, status: true, author: { select: { displayName: true, professionalTitle: true } } } });
      if (!item || item.fragmentId !== fragmentId) throw new Error("Explanation not found in fragment");
      return { authorId: item.authorId, displayName: item.author?.displayName ?? null, professionalTitle: item.author?.professionalTitle ?? null, status: item.status };
    }
    case "comment": {
      const item = await prisma.expertComment.findUnique({ where: { id }, select: { authorId: true, fragmentId: true, status: true, author: { select: { displayName: true, professionalTitle: true } } } });
      if (!item || item.fragmentId !== fragmentId) throw new Error("Comment not found in fragment");
      return { authorId: item.authorId, displayName: item.author?.displayName ?? null, professionalTitle: item.author?.professionalTitle ?? null, status: item.status };
    }
    case "issue": {
      const item = await prisma.issue.findUnique({ where: { id }, select: { fragmentId: true, status: true } });
      if (!item || item.fragmentId !== fragmentId) throw new Error("Issue not found in fragment");
      return { authorId: null, displayName: null, professionalTitle: null, status: item.status };
    }
    case "revision": {
      const item = await prisma.proposedRevision.findUnique({ where: { id }, select: { fragmentId: true, status: true } });
      if (!item || item.fragmentId !== fragmentId) throw new Error("Revision not found in fragment");
      return { authorId: null, displayName: null, professionalTitle: null, status: item.status };
    }
    default:
      throw new Error("Unsupported content kind");
  }
}

function ensureDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for admin writes");
  }
}

async function revalidateFragment(fragmentId: string) {
  await invalidatePublicReaderCache();
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath(`/admin/fragments/${fragmentId}`);
}
