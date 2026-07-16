CREATE TYPE "EditorialRole" AS ENUM ('admin', 'expert');
CREATE TYPE "EditorialUserStatus" AS ENUM ('active', 'disabled');

CREATE TABLE "EditorialUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "professionalTitle" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "EditorialRole" NOT NULL DEFAULT 'expert',
    "status" "EditorialUserStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    CONSTRAINT "EditorialUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EditorialAuditLog" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "targetUserId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EditorialAuditLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PlainExplanation" ADD COLUMN "authorId" TEXT;
ALTER TABLE "ExpertComment" ADD COLUMN "authorId" TEXT;

CREATE UNIQUE INDEX "EditorialUser_username_key" ON "EditorialUser"("username");
CREATE INDEX "EditorialUser_role_status_idx" ON "EditorialUser"("role", "status");
CREATE INDEX "EditorialAuditLog_createdAt_idx" ON "EditorialAuditLog"("createdAt");
CREATE INDEX "EditorialAuditLog_actorUserId_createdAt_idx" ON "EditorialAuditLog"("actorUserId", "createdAt");
CREATE INDEX "EditorialAuditLog_entityType_entityId_createdAt_idx" ON "EditorialAuditLog"("entityType", "entityId", "createdAt");
CREATE INDEX "EditorialAuditLog_targetUserId_createdAt_idx" ON "EditorialAuditLog"("targetUserId", "createdAt");
CREATE INDEX "PlainExplanation_authorId_idx" ON "PlainExplanation"("authorId");
CREATE INDEX "ExpertComment_authorId_idx" ON "ExpertComment"("authorId");

ALTER TABLE "PlainExplanation" ADD CONSTRAINT "PlainExplanation_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "EditorialUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpertComment" ADD CONSTRAINT "ExpertComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "EditorialUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EditorialAuditLog" ADD CONSTRAINT "EditorialAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "EditorialUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EditorialAuditLog" ADD CONSTRAINT "EditorialAuditLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "EditorialUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
