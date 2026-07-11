CREATE TABLE "ChangeFeedback" (
    "id" TEXT NOT NULL,
    "stableId" TEXT NOT NULL,
    "fromVersionId" TEXT NOT NULL,
    "toVersionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "clientHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChangeFeedback_stableId_fromVersionId_toVersionId_kind_clientHash_key" ON "ChangeFeedback"("stableId", "fromVersionId", "toVersionId", "kind", "clientHash");
CREATE INDEX "ChangeFeedback_stableId_fromVersionId_toVersionId_idx" ON "ChangeFeedback"("stableId", "fromVersionId", "toVersionId");
CREATE INDEX "ChangeFeedback_createdAt_idx" ON "ChangeFeedback"("createdAt");
