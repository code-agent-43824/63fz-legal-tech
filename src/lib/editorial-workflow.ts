import { createHash } from "node:crypto";
import type { EditorialActor } from "@/lib/editorial-policy";

export const EDITORIAL_WORKFLOW_STATUSES = ["draft", "in_review", "published", "unpublished"] as const;
export const EDITORIAL_DRAFT_ORIGINS = ["human", "ai_assisted"] as const;
export const EXPERT_CONTRIBUTION_KINDS = ["comment", "recommendation"] as const;

export type EditorialWorkflowStatus = (typeof EDITORIAL_WORKFLOW_STATUSES)[number];
export type EditorialDraftOrigin = (typeof EDITORIAL_DRAFT_ORIGINS)[number];
export type ExpertContributionKind = (typeof EXPERT_CONTRIBUTION_KINDS)[number];

export type EditorialReviewChecklist = {
  factualAccuracy: boolean;
  sources: boolean;
  scope: boolean;
  version: boolean;
  responsibility: boolean;
};

export function canSubmitEditorialReview(actor: EditorialActor, responsibleUserId: string | null, status: string) {
  return actor.kind === "user" && actor.role === "expert" && actor.id === responsibleUserId && (status === "draft" || status === "unpublished");
}

export function canPublishEditorialReview(actor: EditorialActor, responsibleUserId: string | null, status: string, checklist: EditorialReviewChecklist) {
  return actor.kind === "user" && actor.role === "expert" && actor.id === responsibleUserId && status === "in_review" && Object.values(checklist).every(Boolean);
}

export function canUnpublishEditorialContribution(actor: EditorialActor, responsibleUserId: string | null, status: string) {
  return status === "published" && (actor.role === "admin" || (actor.kind === "user" && actor.id === responsibleUserId));
}

export function readEditorialReviewChecklist(formData: FormData): EditorialReviewChecklist {
  return {
    factualAccuracy: formData.get("reviewFactualAccuracy") === "yes",
    sources: formData.get("reviewSources") === "yes",
    scope: formData.get("reviewScope") === "yes",
    version: formData.get("reviewVersion") === "yes",
    responsibility: formData.get("reviewResponsibility") === "yes",
  };
}

export function hashEditorialContent(parts: Array<string | null | undefined>) {
  return createHash("sha256")
    .update(parts.map((part) => part?.trim() ?? "").join("\u0000"))
    .digest("hex");
}

export function assertEditorialDraftOrigin(value: string): EditorialDraftOrigin {
  if (!EDITORIAL_DRAFT_ORIGINS.includes(value as EditorialDraftOrigin)) throw new Error("Unsupported draft origin");
  return value as EditorialDraftOrigin;
}

export function assertExpertContributionKind(value: string): ExpertContributionKind {
  if (!EXPERT_CONTRIBUTION_KINDS.includes(value as ExpertContributionKind)) throw new Error("Unsupported expert contribution kind");
  return value as ExpertContributionKind;
}
