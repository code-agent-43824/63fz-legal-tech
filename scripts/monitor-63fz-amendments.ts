import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";

const DEFAULT_SOURCE_URL =
  "https://normativ.kontur.ru/document?documentId=504436&moduleId=1";
const DEFAULT_OUTPUT_DIR = ".import/amendment-monitor";
const LAW_SLUG = "63fz";
const PUBLIC_VERSION_STATUSES = ["published", "archived"] as const;

export type SourceRevision = {
  moduleId: number;
  documentId: number;
  revisionDate: string;
  effectiveDate: string | null;
  status: number;
  hasEntryDate: boolean;
  sourceUrl: string;
};

export type SourceRevisionIdentity = {
  documentId: number;
  effectiveDate: string | null;
  moduleId: number;
  revisionDate: string;
};

type MonitorOptions = {
  outputDir: string;
  reportFile?: string;
  sourceFile?: string;
  sourceUrl: string;
  stateFile?: string;
};

type MonitorState = {
  checkedAt: string;
  currentVersion: {
    id: string;
    effectiveDate: string | null;
    revisionDate: string | null;
    sourceUrl: string | null;
  } | null;
  latestSourceRevision: SourceRevision;
  latestSourceHtmlSha256: string;
  latestVersionAlreadyImported: boolean;
  newRevisionAvailable: boolean;
  knownVersionCount: number | null;
  previousCheck: {
    checkedAt: string;
    latestDocumentId: number;
    latestRevisionDate: string;
  } | null;
};

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  await mkdir(options.outputDir, { recursive: true });

  const checkedAt = new Date().toISOString();
  const statePath = options.stateFile ?? path.join(options.outputDir, "state.json");
  const previousState = await readPreviousState(statePath);
  const html = options.sourceFile
    ? await readFile(options.sourceFile, "utf8")
    : await fetchSourceHtml(options.sourceUrl);
  const revisions = parseSourceRevisions(html);
  const latestRevision = getLatestRevision(revisions);
  const databaseState = await getDatabaseState(latestRevision);
  const newRevisionAvailable = getMonitorRevisionAvailability({
    currentVersion: databaseState.currentVersion,
    latestRevision,
    latestVersionAlreadyImported: databaseState.latestVersionAlreadyImported,
  });
  const state: MonitorState = {
    checkedAt,
    currentVersion: databaseState.currentVersion,
    latestSourceRevision: latestRevision,
    latestSourceHtmlSha256: sha256(html),
    latestVersionAlreadyImported: databaseState.latestVersionAlreadyImported,
    newRevisionAvailable,
    knownVersionCount: databaseState.knownVersionCount,
    previousCheck: previousState
      ? {
          checkedAt: previousState.checkedAt,
          latestDocumentId: previousState.latestSourceRevision.documentId,
          latestRevisionDate: previousState.latestSourceRevision.revisionDate,
        }
      : null,
  };

  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  const reportPath = options.reportFile ?? path.join(options.outputDir, "latest-report.md");
  const report = formatMonitorReport(state);
  await writeFile(reportPath, report);
  console.log(report);
  console.log(`\nSaved state: ${statePath}`);
  console.log(`Saved report: ${reportPath}`);
}

function parseCliOptions(args: string[]): MonitorOptions {
  const options: MonitorOptions = {
    outputDir: DEFAULT_OUTPUT_DIR,
    sourceUrl: DEFAULT_SOURCE_URL,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--source-url") {
      options.sourceUrl = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--source-file") {
      options.sourceFile = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--output-dir") {
      options.outputDir = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--state-file") {
      options.stateFile = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--report-file") {
      options.reportFile = requireValue(args, index, arg);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function requireValue(args: string[], index: number, arg: string) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Expected value after ${arg}`);
  }
  return value;
}

async function fetchSourceHtml(sourceUrl: string) {
  const response = await fetch(sourceUrl, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; 63fz-legal-tech-monitor/1.0; +https://mescheryakov.pro/63fz)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch source: HTTP ${response.status}`);
  }

  return response.text();
}

export function parseSourceRevisions(html: string): SourceRevision[] {
  const match = html.match(/revisionsJSON:\s*(\[[\s\S]*?\])\s*,/);
  if (!match) {
    throw new Error("Could not find revisionsJSON in source HTML.");
  }

  const raw = JSON.parse(match[1]) as Array<{
    moduleId: number;
    documentId: number;
    date: string;
    entryDate?: string;
    status: number;
    hasEntryDate: boolean;
  }>;

  return raw.map((revision) => ({
    moduleId: revision.moduleId,
    documentId: revision.documentId,
    revisionDate: toDateOnly(revision.date),
    effectiveDate: revision.entryDate ? toDateOnly(revision.entryDate) : null,
    status: revision.status,
    hasEntryDate: revision.hasEntryDate,
    sourceUrl: `https://normativ.kontur.ru/document?moduleId=${revision.moduleId}&documentId=${revision.documentId}`,
  }));
}

export function getLatestRevision(revisions: SourceRevision[]) {
  if (revisions.length === 0) {
    throw new Error("No source revisions found.");
  }

  return [...revisions].sort(compareSourceRevisionsDescending)[0];
}

function compareSourceRevisionsDescending(left: SourceRevision, right: SourceRevision) {
  const leftTime = Date.parse(left.effectiveDate ?? left.revisionDate);
  const rightTime = Date.parse(right.effectiveDate ?? right.revisionDate);
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  const leftRevisionTime = Date.parse(left.revisionDate);
  const rightRevisionTime = Date.parse(right.revisionDate);
  if (leftRevisionTime !== rightRevisionTime) {
    return rightRevisionTime - leftRevisionTime;
  }

  return right.documentId - left.documentId;
}

async function getDatabaseState(latestRevision: SourceRevision) {
  if (!process.env.DATABASE_URL) {
    return {
      currentVersion: null,
      latestVersionAlreadyImported: false,
      knownVersionCount: null,
    };
  }

  const prisma = new PrismaClient();
  try {
    const law = await prisma.law.findUnique({
      where: { slug: LAW_SLUG },
      include: {
        currentVersion: true,
        versions: {
          where: { status: { in: [...PUBLIC_VERSION_STATUSES] } },
          select: {
            effectiveDate: true,
            id: true,
            sourceUrl: true,
            title: true,
          },
        },
      },
    });

    const currentVersion = law?.currentVersion
      ? {
          id: law.currentVersion.id,
          effectiveDate: law.currentVersion.effectiveDate?.toISOString().slice(0, 10) ?? null,
          revisionDate: extractRevisionDate(law.currentVersion.title),
          sourceUrl: law.currentVersion.sourceUrl,
        }
      : null;
    const latestIdentity = getSourceRevisionIdentity(latestRevision);
    const latestVersionAlreadyImported = Boolean(
      law?.versions.some((version) =>
        sourceIdentitiesMatch(
          latestIdentity,
          getLawVersionSourceIdentity({
            effectiveDate: version.effectiveDate?.toISOString().slice(0, 10) ?? null,
            sourceUrl: version.sourceUrl,
            title: version.title,
          }),
        ),
      ),
    );

    return {
      currentVersion,
      latestVersionAlreadyImported,
      knownVersionCount: law?.versions.length ?? 0,
    };
  } finally {
    await prisma.$disconnect();
  }
}

function isNewerThanCurrent(
  latestRevision: SourceRevision,
  currentVersion: MonitorState["currentVersion"],
) {
  if (!currentVersion?.effectiveDate && !currentVersion?.revisionDate) {
    return true;
  }

  const latestEffective = Date.parse(latestRevision.effectiveDate ?? latestRevision.revisionDate);
  const currentEffective = Date.parse(currentVersion.effectiveDate ?? currentVersion.revisionDate ?? "");
  if (Number.isFinite(currentEffective) && latestEffective !== currentEffective) {
    return latestEffective > currentEffective;
  }

  const latestRevisionTime = Date.parse(latestRevision.revisionDate);
  const currentRevisionTime = Date.parse(currentVersion.revisionDate ?? "");
  return Number.isFinite(currentRevisionTime) ? latestRevisionTime > currentRevisionTime : true;
}

export function getMonitorRevisionAvailability({
  currentVersion,
  latestRevision,
  latestVersionAlreadyImported,
}: {
  currentVersion: MonitorState["currentVersion"];
  latestRevision: SourceRevision;
  latestVersionAlreadyImported: boolean;
}) {
  return !latestVersionAlreadyImported && isNewerThanCurrent(latestRevision, currentVersion);
}

export function getSourceRevisionIdentity(revision: SourceRevision): SourceRevisionIdentity {
  return {
    documentId: revision.documentId,
    effectiveDate: revision.effectiveDate,
    moduleId: revision.moduleId,
    revisionDate: revision.revisionDate,
  };
}

export function getLawVersionSourceIdentity(version: {
  effectiveDate: string | null;
  sourceUrl: string | null;
  title: string;
}): SourceRevisionIdentity | null {
  const sourceIds = extractKonturSourceIds(version.sourceUrl);
  const revisionDate = extractRevisionDate(version.title);
  if (!sourceIds || !revisionDate) {
    return null;
  }

  return {
    documentId: sourceIds.documentId,
    effectiveDate: version.effectiveDate,
    moduleId: sourceIds.moduleId,
    revisionDate,
  };
}

export function sourceIdentitiesMatch(
  left: SourceRevisionIdentity | null,
  right: SourceRevisionIdentity | null,
) {
  return Boolean(
    left &&
      right &&
      left.moduleId === right.moduleId &&
      left.documentId === right.documentId &&
      left.revisionDate === right.revisionDate &&
      left.effectiveDate === right.effectiveDate,
  );
}

export function extractKonturSourceIds(sourceUrl: string | null) {
  if (!sourceUrl) {
    return null;
  }

  try {
    const parsed = new URL(sourceUrl);
    if (parsed.protocol !== "https:" || parsed.hostname !== "normativ.kontur.ru") {
      return null;
    }

    const moduleId = parsePositiveSafeInteger(parsed.searchParams.get("moduleId"));
    const documentId = parsePositiveSafeInteger(parsed.searchParams.get("documentId"));
    if (moduleId === null || documentId === null) {
      return null;
    }

    return { documentId, moduleId };
  } catch {
    return null;
  }
}

function parsePositiveSafeInteger(value: string | null) {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function readPreviousState(statePath: string): Promise<MonitorState | null> {
  try {
    return JSON.parse(await readFile(statePath, "utf8")) as MonitorState;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function formatMonitorReport(state: MonitorState) {
  const previous = state.previousCheck
    ? `${state.previousCheck.checkedAt}; latest ${state.previousCheck.latestRevisionDate} / ${state.previousCheck.latestDocumentId}`
    : "none";
  const verdict = state.newRevisionAvailable
    ? "possible new revision found; run importer dry-run and review before any write"
    : "no newer revision detected";
  const importCommand = `pnpm law:import:63fz -- --dry-run --source-url ${state.latestSourceRevision.sourceUrl} --revision-date ${state.latestSourceRevision.revisionDate} --effective-date ${state.latestSourceRevision.effectiveDate ?? state.latestSourceRevision.revisionDate} --version-id ${buildVersionId(state.latestSourceRevision)}`;

  return `# 63-FZ Amendment Monitor Report

- Checked at: ${state.checkedAt}
- Verdict: ${verdict}
- Latest source revision: ${state.latestSourceRevision.revisionDate}
- Latest effective date: ${state.latestSourceRevision.effectiveDate ?? "not specified"}
- Latest documentId: ${state.latestSourceRevision.documentId}
- Latest source URL: ${state.latestSourceRevision.sourceUrl}
- Latest source HTML SHA-256: ${state.latestSourceHtmlSha256}
- Current DB version: ${state.currentVersion?.id ?? "not available"}
- Current DB revision date: ${state.currentVersion?.revisionDate ?? "not available"}
- Current DB effective date: ${state.currentVersion?.effectiveDate ?? "not available"}
- Known imported versions: ${state.knownVersionCount ?? "not available"}
- Latest source revision already imported: ${state.latestVersionAlreadyImported ? "yes" : "no"}
- Previous check: ${previous}

Next safe import dry-run command:

\`\`\`bash
${importCommand}
\`\`\`

Do not use \`--write\` or \`--set-current\` until the dry-run report has been reviewed.
`;
}

function buildVersionId(revision: SourceRevision) {
  if (revision.status === 0) {
    return `63fz-current-${revision.revisionDate}`;
  }

  const suffix =
    revision.effectiveDate && revision.effectiveDate !== revision.revisionDate
      ? `-effective-${revision.effectiveDate}`
      : "";
  return `63fz-revision-${revision.revisionDate}${suffix}`;
}

function extractRevisionDate(title: string) {
  const match = title.match(/ред\.\s+от\s+(\d{2})\.(\d{2})\.(\d{4})/i);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function toDateOnly(value: string) {
  return value.slice(0, 10);
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
