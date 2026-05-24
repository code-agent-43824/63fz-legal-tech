-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LawVersionStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "FragmentType" AS ENUM ('law', 'chapter', 'article', 'part', 'point', 'paragraph');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "IssueType" AS ENUM ('typo', 'contradiction', 'ambiguity', 'outdated_norm', 'technical_error', 'enforcement_problem', 'other');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('hypothesis', 'confirmed', 'rejected', 'fixed_in_proposal');

-- CreateEnum
CREATE TYPE "ProposedRevisionStatus" AS ENUM ('draft', 'proposed', 'accepted', 'rejected');

-- CreateTable
CREATE TABLE "Law" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Law_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LawVersion" (
    "id" TEXT NOT NULL,
    "lawId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3),
    "sourceUrl" TEXT,
    "status" "LawVersionStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LawVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LawFragment" (
    "id" TEXT NOT NULL,
    "lawVersionId" TEXT NOT NULL,
    "stableId" TEXT NOT NULL,
    "parentId" TEXT,
    "type" "FragmentType" NOT NULL,
    "number" TEXT,
    "title" TEXT,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "anchor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LawFragment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlainExplanation" (
    "id" TEXT NOT NULL,
    "fragmentId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "authorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlainExplanation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpertComment" (
    "id" TEXT NOT NULL,
    "fragmentId" TEXT NOT NULL,
    "expertName" TEXT NOT NULL,
    "expertTitle" TEXT,
    "text" TEXT NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpertComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "fragmentId" TEXT NOT NULL,
    "type" "IssueType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "IssueSeverity" NOT NULL DEFAULT 'low',
    "status" "IssueStatus" NOT NULL DEFAULT 'hypothesis',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposedRevision" (
    "id" TEXT NOT NULL,
    "fragmentId" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "proposedText" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "status" "ProposedRevisionStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposedRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Law_slug_key" ON "Law"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Law_currentVersionId_key" ON "Law"("currentVersionId");

-- CreateIndex
CREATE INDEX "LawVersion_lawId_status_idx" ON "LawVersion"("lawId", "status");

-- CreateIndex
CREATE INDEX "LawFragment_lawVersionId_parentId_order_idx" ON "LawFragment"("lawVersionId", "parentId", "order");

-- CreateIndex
CREATE INDEX "LawFragment_anchor_idx" ON "LawFragment"("anchor");

-- CreateIndex
CREATE UNIQUE INDEX "LawFragment_lawVersionId_stableId_key" ON "LawFragment"("lawVersionId", "stableId");

-- CreateIndex
CREATE UNIQUE INDEX "LawFragment_lawVersionId_anchor_key" ON "LawFragment"("lawVersionId", "anchor");

-- CreateIndex
CREATE INDEX "PlainExplanation_fragmentId_status_idx" ON "PlainExplanation"("fragmentId", "status");

-- CreateIndex
CREATE INDEX "ExpertComment_fragmentId_status_idx" ON "ExpertComment"("fragmentId", "status");

-- CreateIndex
CREATE INDEX "Issue_fragmentId_status_idx" ON "Issue"("fragmentId", "status");

-- CreateIndex
CREATE INDEX "ProposedRevision_fragmentId_status_idx" ON "ProposedRevision"("fragmentId", "status");

-- AddForeignKey
ALTER TABLE "Law" ADD CONSTRAINT "Law_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "LawVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawVersion" ADD CONSTRAINT "LawVersion_lawId_fkey" FOREIGN KEY ("lawId") REFERENCES "Law"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawFragment" ADD CONSTRAINT "LawFragment_lawVersionId_fkey" FOREIGN KEY ("lawVersionId") REFERENCES "LawVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawFragment" ADD CONSTRAINT "LawFragment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "LawFragment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlainExplanation" ADD CONSTRAINT "PlainExplanation_fragmentId_fkey" FOREIGN KEY ("fragmentId") REFERENCES "LawFragment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertComment" ADD CONSTRAINT "ExpertComment_fragmentId_fkey" FOREIGN KEY ("fragmentId") REFERENCES "LawFragment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_fragmentId_fkey" FOREIGN KEY ("fragmentId") REFERENCES "LawFragment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposedRevision" ADD CONSTRAINT "ProposedRevision_fragmentId_fkey" FOREIGN KEY ("fragmentId") REFERENCES "LawFragment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

