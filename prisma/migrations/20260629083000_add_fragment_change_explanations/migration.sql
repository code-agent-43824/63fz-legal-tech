-- CreateTable
CREATE TABLE "FragmentChangeExplanation" (
    "id" TEXT NOT NULL,
    "stableId" TEXT NOT NULL,
    "fromVersionId" TEXT NOT NULL,
    "toVersionId" TEXT NOT NULL,
    "reason" TEXT,
    "purpose" TEXT,
    "practicalMeaning" TEXT,
    "sourceLinks" TEXT,
    "status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FragmentChangeExplanation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FragmentChangeExplanation_stableId_fromVersionId_toVersionId_key" ON "FragmentChangeExplanation"("stableId", "fromVersionId", "toVersionId");

-- CreateIndex
CREATE INDEX "FragmentChangeExplanation_stableId_status_idx" ON "FragmentChangeExplanation"("stableId", "status");

-- CreateIndex
CREATE INDEX "FragmentChangeExplanation_fromVersionId_toVersionId_idx" ON "FragmentChangeExplanation"("fromVersionId", "toVersionId");

-- AddForeignKey
ALTER TABLE "FragmentChangeExplanation" ADD CONSTRAINT "FragmentChangeExplanation_fromVersionId_fkey" FOREIGN KEY ("fromVersionId") REFERENCES "LawVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FragmentChangeExplanation" ADD CONSTRAINT "FragmentChangeExplanation_toVersionId_fkey" FOREIGN KEY ("toVersionId") REFERENCES "LawVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
