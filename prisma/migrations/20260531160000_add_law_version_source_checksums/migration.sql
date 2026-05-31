-- Add source audit fields for reproducible legal-text imports.
ALTER TABLE "LawVersion" ADD COLUMN "sourceName" TEXT;
ALTER TABLE "LawVersion" ADD COLUMN "sourceRetrievedAt" TIMESTAMP(3);
ALTER TABLE "LawVersion" ADD COLUMN "sourceHtmlSha256" TEXT;
ALTER TABLE "LawVersion" ADD COLUMN "sourceTextSha256" TEXT;
