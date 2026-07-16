import type { Prisma } from "@prisma/client";
import type { EditorialActor } from "@/lib/editorial-policy";
import { prisma } from "@/lib/prisma";

export async function recordEditorialAudit({
  actor,
  action,
  entityType,
  entityId,
  targetUserId,
  details,
}: {
  actor: EditorialActor;
  action: string;
  entityType: string;
  entityId?: string | null;
  targetUserId?: string | null;
  details?: Prisma.InputJsonValue;
}) {
  await prisma.editorialAuditLog.create({
    data: {
      actorType: actor.kind,
      actorUserId: actor.id,
      actorName: actor.displayName,
      action,
      entityType,
      entityId: entityId ?? null,
      targetUserId: targetUserId ?? null,
      details,
    },
  });
}
