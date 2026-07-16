"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { readOptionalShortText, readRecordId, readRequiredText } from "@/lib/admin-validation";
import { getCurrentEditorialActor } from "@/lib/auth";
import { recordEditorialAudit } from "@/lib/editorial-audit";
import { hashEditorialPassword } from "@/lib/editorial-password";
import { assertEditorialUsername, type EditorialActor } from "@/lib/editorial-policy";
import { prisma } from "@/lib/prisma";
import { invalidatePublicReaderCache } from "@/lib/reader-cache";

export async function createExpert(formData: FormData) {
  const actor = await requireAdministrator();
  const username = assertEditorialUsername(readRequiredText(formData, "username", 50));
  const displayName = readRequiredText(formData, "displayName", 300);
  const professionalTitle = readOptionalShortText(formData, "professionalTitle");
  const passwordHash = await hashEditorialPassword(readRequiredText(formData, "password", 200));

  const user = await prisma.editorialUser.create({
    data: { username, displayName, professionalTitle, passwordHash, role: "expert" },
  });
  await recordEditorialAudit({
    actor,
    action: "user.create",
    entityType: "editorial-user",
    entityId: user.id,
    targetUserId: user.id,
    details: { role: user.role },
  });
  revalidatePath("/admin/users");
}

export async function updateExpert(formData: FormData) {
  const actor = await requireAdministrator();
  const id = readRecordId(formData, "id");
  const displayName = readRequiredText(formData, "displayName", 300);
  const professionalTitle = readOptionalShortText(formData, "professionalTitle");
  const status = String(formData.get("status") ?? "");
  if (status !== "active" && status !== "disabled") {
    throw new Error("Unsupported account status");
  }

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.editorialUser.update({
      where: { id, role: "expert" },
      data: { displayName, professionalTitle, status },
    });
    await tx.plainExplanation.updateMany({ where: { authorId: id }, data: { authorName: displayName } });
    await tx.expertComment.updateMany({ where: { authorId: id }, data: { expertName: displayName, expertTitle: professionalTitle } });
    return updated;
  });
  await recordEditorialAudit({
    actor,
    action: "user.update",
    entityType: "editorial-user",
    entityId: user.id,
    targetUserId: user.id,
    details: { status },
  });
  await invalidatePublicReaderCache();
  revalidatePath("/");
  revalidatePath("/admin/users");
}

export async function resetExpertPassword(formData: FormData) {
  const actor = await requireAdministrator();
  const id = readRecordId(formData, "id");
  const passwordHash = await hashEditorialPassword(readRequiredText(formData, "password", 200));
  const user = await prisma.editorialUser.update({
    where: { id, role: "expert" },
    data: { passwordHash },
  });
  await recordEditorialAudit({
    actor,
    action: "user.password-reset",
    entityType: "editorial-user",
    entityId: user.id,
    targetUserId: user.id,
  });
  revalidatePath("/admin/users");
}

async function requireAdministrator(): Promise<EditorialActor> {
  const actor = await getCurrentEditorialActor();
  if (!actor) redirect("/admin/login");
  if (actor.role !== "admin") redirect("/admin");
  return actor;
}
