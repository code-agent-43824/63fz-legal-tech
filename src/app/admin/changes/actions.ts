"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { readOptionalSourceLinks, readOptionalText, readRecordId, readStableId, requireDeleteConfirmation } from "@/lib/admin-validation";
import { getCurrentEditorialActor } from "@/lib/auth";
import { withBasePath } from "@/lib/base-path";
import { recordEditorialAudit } from "@/lib/editorial-audit";
import type { EditorialActor } from "@/lib/editorial-policy";
import { assertEditorialDraftOrigin, canPublishEditorialReview, canSubmitEditorialReview, canUnpublishEditorialContribution, hashEditorialContent, readEditorialReviewChecklist } from "@/lib/editorial-workflow";
import { prisma } from "@/lib/prisma";
import { invalidatePublicReaderCache } from "@/lib/reader-cache";

export async function saveChangeExplanation(formData: FormData) {
  const actor = await requireActor(); ensureDatabase();
  const stableId = readStableId(formData,"stableId"), fromVersionId=readRecordId(formData,"fromVersionId"), toVersionId=readRecordId(formData,"toVersionId");
  const existing=await prisma.fragmentChangeExplanation.findUnique({where:{stableId_fromVersionId_toVersionId:{stableId,fromVersionId,toVersionId}}});
  const reviewer=await resolveReviewer(actor,formData,existing?.reviewerId??null);
  if(actor.role==="expert" && existing?.reviewerId!==actor.id) throw new Error("You may only edit change explanations assigned to you");
  const requested=assertEditorialDraftOrigin(String(formData.get("origin")??existing?.origin??"human"));
  const origin=existing?.origin==="ai_assisted"?"ai_assisted":requested;
  const data={reason:readOptionalText(formData,"reason"),purpose:readOptionalText(formData,"purpose"),practicalMeaning:readOptionalText(formData,"practicalMeaning"),sourceLinks:readOptionalSourceLinks(formData,"sourceLinks"),origin,reviewerId:reviewer.id,status:"draft" as const,reviewedAt:null,reviewedContentSha256:null};
  const explanation=await prisma.fragmentChangeExplanation.upsert({where:{stableId_fromVersionId_toVersionId:{stableId,fromVersionId,toVersionId}},create:{stableId,fromVersionId,toVersionId,...data},update:data});
  await recordEditorialAudit({actor,action:"change-explanation.edit-reset-to-draft",entityType:"change-explanation",entityId:explanation.id,targetUserId:reviewer.id,details:{stableId,fromVersionId,toVersionId,beforeStatus:existing?.status??null,origin}}); await revalidateChanges();
}

export async function submitChangeForReview(formData:FormData){const actor=await requireActor();const item=await readItem(formData);if(!canSubmitEditorialReview(actor,item.reviewerId,item.status))throw new Error("Only the responsible expert may submit this draft");await prisma.fragmentChangeExplanation.update({where:{id:item.id},data:{status:"in_review",reviewedAt:null,reviewedContentSha256:null}});await auditTransition(actor,item,"change-explanation.submit-review");await revalidateChanges();}
export async function publishReviewedChange(formData:FormData){const actor=await requireActor();const item=await readItem(formData);const checklist=readEditorialReviewChecklist(formData);if(!canPublishEditorialReview(actor,item.reviewerId,item.status,checklist))throw new Error("Publication requires all review confirmations and responsibility");const contentHash=hashEditorialContent([item.stableId,item.fromVersionId,item.toVersionId,item.reason,item.purpose,item.practicalMeaning,item.sourceLinks,item.origin]);await prisma.fragmentChangeExplanation.update({where:{id:item.id},data:{status:"published",reviewedAt:new Date(),reviewedContentSha256:contentHash}});await recordEditorialAudit({actor,action:"change-explanation.publish-reviewed",entityType:"change-explanation",entityId:item.id,details:{contentHash,checklist,origin:item.origin}});await revalidateChanges();}
export async function unpublishChange(formData:FormData){const actor=await requireActor();const item=await readItem(formData);if(!canUnpublishEditorialContribution(actor,item.reviewerId,item.status))throw new Error("Only reviewer or administrator may unpublish");await prisma.fragmentChangeExplanation.update({where:{id:item.id},data:{status:"unpublished"}});await auditTransition(actor,item,"change-explanation.unpublish");await revalidateChanges();}
export async function deleteChangeExplanation(formData:FormData){const actor=await requireActor();if(actor.role!=="admin")throw new Error("Only administrators may delete");requireDeleteConfirmation(formData);const id=readRecordId(formData,"id");await prisma.fragmentChangeExplanation.delete({where:{id}});await recordEditorialAudit({actor,action:"change-explanation.delete",entityType:"change-explanation",entityId:id});await revalidateChanges();}

async function readItem(formData:FormData){const id=readRecordId(formData,"id");const item=await prisma.fragmentChangeExplanation.findUnique({where:{id}});if(!item)throw new Error("Change explanation not found");return item;}
async function auditTransition(actor:EditorialActor,item:Awaited<ReturnType<typeof readItem>>,action:string){await recordEditorialAudit({actor,action,entityType:"change-explanation",entityId:item.id,details:{stableId:item.stableId,origin:item.origin}});}
async function resolveReviewer(actor:EditorialActor,formData:FormData,current:string|null){if(actor.kind==="user"&&actor.role==="expert")return{id:actor.id};if(actor.role!=="admin")throw new Error("Administrator required");const id=String(formData.get("reviewerId")??current??"").trim();if(!id)throw new Error("Active expert is required");const user=await prisma.editorialUser.findFirst({where:{id,role:"expert",status:"active"},select:{id:true}});if(!user)throw new Error("Active expert is required");return user;}
async function requireActor():Promise<EditorialActor>{const actor=await getCurrentEditorialActor();if(!actor)redirect(withBasePath("/admin/login"));return actor;}
function ensureDatabase(){if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required");}
async function revalidateChanges(){await invalidatePublicReaderCache();revalidatePath("/");revalidatePath("/admin");revalidatePath("/admin/changes");revalidatePath("/admin/review");}
