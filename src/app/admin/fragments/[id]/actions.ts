"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  readContentKind,
  readIssueSeverity,
  readIssueStatus,
  readIssueType,
  readOptionalSourceLinks,
  readRecordId,
  readRequiredText,
  readRevisionStatus,
  requireDeleteConfirmation,
} from "@/lib/admin-validation";
import { getCurrentEditorialActor } from "@/lib/auth";
import { withBasePath } from "@/lib/base-path";
import { recordEditorialAudit } from "@/lib/editorial-audit";
import {
  canCreateEditorialContent,
  canDeleteEditorialContent,
  canEditEditorialContent,
  type EditorialActor,
} from "@/lib/editorial-policy";
import {
  assertEditorialDraftOrigin,
  assertExpertContributionKind,
  canPublishEditorialReview,
  canSubmitEditorialReview,
  canUnpublishEditorialContribution,
  hashEditorialContent,
  readEditorialReviewChecklist,
} from "@/lib/editorial-workflow";
import { prisma } from "@/lib/prisma";
import { invalidatePublicReaderCache } from "@/lib/reader-cache";

export async function createContent(formData: FormData) {
  const actor = await requireActor();
  const fragmentId = readRecordId(formData, "fragmentId");
  const kind = readContentKind(formData);
  if (!canCreateEditorialContent(actor, kind)) throw new Error("Insufficient permissions for this content type");
  ensureDatabase();

  let createdId: string;
  if (kind === "explanation" || kind === "comment") {
    const responsible = await resolveResponsibleExpert(actor, formData);
    const origin = assertEditorialDraftOrigin(String(formData.get("origin") ?? "human"));
    const sourceLinks = readOptionalSourceLinks(formData, "sourceLinks");
    if (kind === "explanation") {
      createdId = (await prisma.plainExplanation.create({
        data: {
          fragmentId,
          text: readRequiredText(formData, "text"),
          status: "draft",
          authorName: responsible.displayName,
          authorId: responsible.id,
          origin,
          sourceLinks,
        },
      })).id;
    } else {
      createdId = (await prisma.expertComment.create({
        data: {
          fragmentId,
          expertName: responsible.displayName,
          expertTitle: responsible.professionalTitle,
          authorId: responsible.id,
          kind: assertExpertContributionKind(String(formData.get("contributionKind") ?? "comment")),
          origin,
          sourceLinks,
          text: readRequiredText(formData, "text"),
          status: "draft",
        },
      })).id;
    }
    await recordEditorialAudit({ actor, action: "content.create-draft", entityType: kind, entityId: createdId, targetUserId: responsible.id, details: { fragmentId, origin } });
  } else if (kind === "issue") {
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
  } else {
    createdId = (await prisma.proposedRevision.create({
      data: {
        fragmentId,
        originalText: readRequiredText(formData, "originalText"),
        proposedText: readRequiredText(formData, "proposedText"),
        rationale: readRequiredText(formData, "rationale"),
        status: readRevisionStatus(formData),
      },
    })).id;
  }

  if (kind === "issue" || kind === "revision") {
    await recordEditorialAudit({ actor, action: "content.create", entityType: kind, entityId: createdId, details: { fragmentId, status: String(formData.get("status") ?? "") } });
  }
  await revalidateFragment(fragmentId);
}

export async function updateContent(formData: FormData) {
  const actor = await requireActor();
  const fragmentId = readRecordId(formData, "fragmentId");
  const id = readRecordId(formData, "id");
  const kind = readContentKind(formData);
  ensureDatabase();
  const existing = await getContentRecord(kind, id, fragmentId);
  if (!canEditEditorialContent(actor, kind, existing.authorId)) throw new Error("You may only edit your own expert contributions");

  if (kind === "explanation" || kind === "comment") {
    const responsible = actor.role === "admin" ? await resolveResponsibleExpert(actor, formData) : await requireActorExpert(actor);
    const requestedOrigin = assertEditorialDraftOrigin(String(formData.get("origin") ?? existing.origin ?? "human"));
    const origin = existing.origin === "ai_assisted" ? "ai_assisted" : requestedOrigin;
    const sourceLinks = readOptionalSourceLinks(formData, "sourceLinks");
    if (kind === "explanation") {
      await prisma.plainExplanation.update({
        where: { id },
        data: {
          text: readRequiredText(formData, "text"),
          sourceLinks,
          origin,
          status: "draft",
          authorId: responsible.id,
          authorName: responsible.displayName,
          reviewedAt: null,
          reviewedContentSha256: null,
        },
      });
    } else {
      await prisma.expertComment.update({
        where: { id },
        data: {
          text: readRequiredText(formData, "text"),
          sourceLinks,
          origin,
          kind: assertExpertContributionKind(String(formData.get("contributionKind") ?? existing.contributionKind ?? "comment")),
          status: "draft",
          authorId: responsible.id,
          expertName: responsible.displayName,
          expertTitle: responsible.professionalTitle,
          reviewedAt: null,
          reviewedContentSha256: null,
        },
      });
    }
    await recordEditorialAudit({ actor, action: "content.edit-reset-to-draft", entityType: kind, entityId: id, targetUserId: responsible.id, details: { fragmentId, beforeStatus: existing.status, origin } });
  } else if (kind === "issue") {
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
  } else {
    await prisma.proposedRevision.update({
      where: { id },
      data: {
        originalText: readRequiredText(formData, "originalText"),
        proposedText: readRequiredText(formData, "proposedText"),
        rationale: readRequiredText(formData, "rationale"),
        status: readRevisionStatus(formData),
      },
    });
  }

  if (kind === "issue" || kind === "revision") {
    await recordEditorialAudit({ actor, action: "content.update", entityType: kind, entityId: id, details: { fragmentId, beforeStatus: existing.status, afterStatus: String(formData.get("status") ?? "") } });
  }
  await revalidateFragment(fragmentId);
}

export async function submitContentForReview(formData: FormData) {
  const actor = await requireActor();
  const { fragmentId, id, kind, record } = await readWorkflowRecord(formData);
  if (!canSubmitEditorialReview(actor, record.authorId, record.status)) throw new Error("Only the responsible expert may submit this draft for review");
  await setContributionWorkflowState(kind, id, { status: "in_review", reviewedAt: null, reviewedContentSha256: null });
  await recordEditorialAudit({ actor, action: "content.submit-review", entityType: kind, entityId: id, details: { fragmentId, origin: record.origin } });
  await revalidateFragment(fragmentId);
}

export async function publishReviewedContent(formData: FormData) {
  const actor = await requireActor();
  const { fragmentId, id, kind, record } = await readWorkflowRecord(formData);
  const checklist = readEditorialReviewChecklist(formData);
  if (!canPublishEditorialReview(actor, record.authorId, record.status, checklist)) throw new Error("Publication requires the responsible expert, review state, all checklist confirmations, and explicit responsibility");
  const contentHash = hashContributionRecord(kind, record);
  const reviewedAt = new Date();
  await setContributionWorkflowState(kind, id, { status: "published", reviewedAt, reviewedContentSha256: contentHash });
  await recordEditorialAudit({ actor, action: "content.publish-reviewed", entityType: kind, entityId: id, details: { fragmentId, origin: record.origin, contentHash, checklist } });
  await revalidateFragment(fragmentId);
}

export async function unpublishContent(formData: FormData) {
  const actor = await requireActor();
  const { fragmentId, id, kind, record } = await readWorkflowRecord(formData);
  if (!canUnpublishEditorialContribution(actor, record.authorId, record.status)) throw new Error("Only the author or administrator may unpublish a published contribution");
  await setContributionWorkflowState(kind, id, { status: "unpublished" });
  await recordEditorialAudit({ actor, action: "content.unpublish", entityType: kind, entityId: id, details: { fragmentId, contentHash: record.reviewedContentSha256 } });
  await revalidateFragment(fragmentId);
}

export async function deleteContent(formData: FormData) {
  const actor = await requireActor();
  if (!canDeleteEditorialContent(actor)) throw new Error("Only administrators may delete contributions");
  requireDeleteConfirmation(formData);
  const fragmentId = readRecordId(formData, "fragmentId");
  const id = readRecordId(formData, "id");
  const kind = readContentKind(formData);
  ensureDatabase();
  const existing = await getContentRecord(kind, id, fragmentId);
  if (kind === "explanation") await prisma.plainExplanation.delete({ where: { id } });
  else if (kind === "comment") await prisma.expertComment.delete({ where: { id } });
  else if (kind === "issue") await prisma.issue.delete({ where: { id } });
  else await prisma.proposedRevision.delete({ where: { id } });
  await recordEditorialAudit({ actor, action: "content.delete", entityType: kind, entityId: id, details: { fragmentId, status: existing.status } });
  await revalidateFragment(fragmentId);
}

async function readWorkflowRecord(formData: FormData) {
  const fragmentId = readRecordId(formData, "fragmentId");
  const id = readRecordId(formData, "id");
  const kind = readContentKind(formData);
  if (kind !== "explanation" && kind !== "comment") throw new Error("This content type does not use expert review workflow");
  const record = await getContentRecord(kind, id, fragmentId);
  return { fragmentId, id, kind, record } as const;
}

async function setContributionWorkflowState(kind: "explanation" | "comment", id: string, data: { status: "draft" | "in_review" | "published" | "unpublished"; reviewedAt?: Date | null; reviewedContentSha256?: string | null }) {
  if (kind === "explanation") await prisma.plainExplanation.update({ where: { id }, data });
  else await prisma.expertComment.update({ where: { id }, data });
}

function hashContributionRecord(kind: "explanation" | "comment", record: Awaited<ReturnType<typeof getContentRecord>>) {
  return hashEditorialContent(kind === "explanation"
    ? [kind, record.text, record.sourceLinks, record.origin]
    : [kind, record.contributionKind, record.text, record.sourceLinks, record.origin]);
}

async function resolveResponsibleExpert(actor: EditorialActor, formData: FormData) {
  if (actor.kind === "user" && actor.role === "expert") return requireActorExpert(actor);
  if (actor.role !== "admin") throw new Error("Only an administrator can assign another expert");
  const authorId = readRecordId(formData, "authorId");
  const user = await prisma.editorialUser.findFirst({ where: { id: authorId, role: "expert", status: "active" }, select: { id: true, displayName: true, professionalTitle: true } });
  if (!user) throw new Error("An active expert account is required");
  return user;
}

function requireActorExpert(actor: EditorialActor) {
  if (actor.kind !== "user" || actor.role !== "expert") throw new Error("An attributable expert account is required");
  return { id: actor.id, displayName: actor.displayName, professionalTitle: actor.professionalTitle };
}

async function requireActor(): Promise<EditorialActor> {
  const actor = await getCurrentEditorialActor();
  if (!actor) redirect(withBasePath("/admin/login"));
  return actor;
}

async function getContentRecord(kind: string, id: string, fragmentId: string) {
  if (kind === "explanation") {
    const item = await prisma.plainExplanation.findUnique({ where: { id }, select: { authorId: true, fragmentId: true, status: true, origin: true, sourceLinks: true, text: true, reviewedContentSha256: true } });
    if (!item || item.fragmentId !== fragmentId) throw new Error("Explanation not found in fragment");
    return { ...item, contributionKind: null };
  }
  if (kind === "comment") {
    const item = await prisma.expertComment.findUnique({ where: { id }, select: { authorId: true, fragmentId: true, status: true, origin: true, sourceLinks: true, text: true, kind: true, reviewedContentSha256: true } });
    if (!item || item.fragmentId !== fragmentId) throw new Error("Comment not found in fragment");
    return { ...item, contributionKind: item.kind };
  }
  if (kind === "issue") {
    const item = await prisma.issue.findUnique({ where: { id }, select: { fragmentId: true, status: true } });
    if (!item || item.fragmentId !== fragmentId) throw new Error("Issue not found in fragment");
    return { ...item, authorId: null, origin: null, sourceLinks: null, text: null, reviewedContentSha256: null, contributionKind: null };
  }
  if (kind === "revision") {
    const item = await prisma.proposedRevision.findUnique({ where: { id }, select: { fragmentId: true, status: true } });
    if (!item || item.fragmentId !== fragmentId) throw new Error("Revision not found in fragment");
    return { ...item, authorId: null, origin: null, sourceLinks: null, text: null, reviewedContentSha256: null, contributionKind: null };
  }
  throw new Error("Unsupported content kind");
}

function ensureDatabase() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for admin writes");
}

async function revalidateFragment(fragmentId: string) {
  await invalidatePublicReaderCache();
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/review");
  revalidatePath(`/admin/fragments/${fragmentId}`);
}
