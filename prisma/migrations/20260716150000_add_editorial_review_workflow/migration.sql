ALTER TYPE "PublicationStatus" ADD VALUE IF NOT EXISTS 'in_review';
ALTER TYPE "PublicationStatus" ADD VALUE IF NOT EXISTS 'unpublished';

CREATE TYPE "EditorialDraftOrigin" AS ENUM ('human', 'ai_assisted');
CREATE TYPE "ExpertContributionKind" AS ENUM ('comment', 'recommendation');

ALTER TABLE "PlainExplanation"
  ADD COLUMN "origin" "EditorialDraftOrigin" NOT NULL DEFAULT 'human',
  ADD COLUMN "sourceLinks" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedContentSha256" TEXT;

ALTER TABLE "ExpertComment"
  ADD COLUMN "kind" "ExpertContributionKind" NOT NULL DEFAULT 'comment',
  ADD COLUMN "origin" "EditorialDraftOrigin" NOT NULL DEFAULT 'human',
  ADD COLUMN "sourceLinks" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedContentSha256" TEXT;

ALTER TABLE "FragmentChangeExplanation"
  ADD COLUMN "origin" "EditorialDraftOrigin" NOT NULL DEFAULT 'human',
  ADD COLUMN "reviewerId" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedContentSha256" TEXT;

UPDATE "PlainExplanation"
SET "reviewedAt" = "updatedAt", "reviewedContentSha256" = 'legacy-reviewed-before-workflow'
WHERE "status" = 'published';

UPDATE "ExpertComment"
SET "reviewedAt" = "updatedAt", "reviewedContentSha256" = 'legacy-reviewed-before-workflow'
WHERE "status" = 'published';

UPDATE "FragmentChangeExplanation"
SET "reviewedAt" = "updatedAt", "reviewedContentSha256" = 'legacy-reviewed-before-workflow'
WHERE "status" = 'published';

CREATE INDEX "FragmentChangeExplanation_reviewerId_status_idx"
  ON "FragmentChangeExplanation"("reviewerId", "status");

ALTER TABLE "FragmentChangeExplanation"
  ADD CONSTRAINT "FragmentChangeExplanation_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "EditorialUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
