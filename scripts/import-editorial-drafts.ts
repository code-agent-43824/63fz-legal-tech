// Loads prepared plain-language explanation drafts into the editorial pipeline.
//
// Safety model, deliberately narrow:
//   * every row is written with status `draft` and origin `ai_assisted`, both hardcoded — this
//     script has no option to publish, submit for review, or change an existing published item;
//   * it never touches official law text, only `PlainExplanation` rows attached to fragments;
//   * it is dry-run by default and requires an explicit `--write`;
//   * it is idempotent: a fragment that already carries an ai-assisted draft is skipped, so
//     re-running never fans out duplicates for an expert to clean up.
//
// AI-assisted drafts stay invisible to readers until a responsible expert reviews, corrects, and
// publishes them through the admin workflow, which requires the factual/source/scope/version
// confirmations defined in docs/PLAN.md point 15.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";

import { PUBLIC_LAW_SLUG } from "../src/lib/law-scope.ts";

const DEFAULT_DRAFT_FILE = "content/editorial-drafts/63fz-article-13.json";

type DraftFile = {
  lawSlug: string;
  drafts: DraftEntry[];
};

type DraftEntry = {
  stableId: string;
  text: string;
};

type CliOptions = {
  draftFile: string;
  write: boolean;
};

type PlannedAction =
  | { action: "create"; stableId: string; fragmentId: string; chars: number }
  | { action: "skip"; stableId: string; reason: string };

async function main() {
  const options = parseCliOptions(process.argv.slice(2));

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Point it at the target database explicitly.");
  }

  const file = await readDraftFile(options.draftFile);
  if (file.lawSlug !== PUBLIC_LAW_SLUG) {
    throw new Error(`Draft file targets law "${file.lawSlug}", expected "${PUBLIC_LAW_SLUG}".`);
  }

  const prisma = new PrismaClient();
  try {
    const plan = await buildPlan(prisma, file.drafts);
    reportPlan(plan, options);

    if (!options.write) {
      console.log("\nDry run. Nothing was written. Re-run with --write to apply.");
      return;
    }

    const creates = plan.filter((item) => item.action === "create");
    for (const item of creates) {
      await prisma.plainExplanation.create({
        data: {
          fragmentId: item.fragmentId,
          text: file.drafts.find((draft) => draft.stableId === item.stableId)?.text ?? "",
          // Both values are fixed: an imported draft is never public and never loses its origin.
          status: "draft",
          origin: "ai_assisted",
        },
      });
    }

    console.log(`\nCreated ${creates.length} ai-assisted draft(s) with status "draft".`);
    console.log("They are not public. A responsible expert must review and publish each one.");
  } finally {
    await prisma.$disconnect();
  }
}

async function buildPlan(prisma: PrismaClient, drafts: DraftEntry[]): Promise<PlannedAction[]> {
  const law = await prisma.law.findUnique({
    where: { slug: PUBLIC_LAW_SLUG },
    select: { currentVersionId: true },
  });

  if (!law?.currentVersionId) {
    throw new Error(`Law "${PUBLIC_LAW_SLUG}" has no current version in this database.`);
  }

  const plan: PlannedAction[] = [];

  for (const draft of drafts) {
    const fragment = await prisma.lawFragment.findUnique({
      where: {
        lawVersionId_stableId: {
          lawVersionId: law.currentVersionId,
          stableId: draft.stableId,
        },
      },
      select: { id: true },
    });

    if (!fragment) {
      plan.push({
        action: "skip",
        stableId: draft.stableId,
        reason: "fragment not found in the current version",
      });
      continue;
    }

    const existing = await prisma.plainExplanation.findFirst({
      where: { fragmentId: fragment.id, origin: "ai_assisted" },
      select: { id: true, status: true },
    });

    if (existing) {
      plan.push({
        action: "skip",
        stableId: draft.stableId,
        reason: `ai-assisted explanation already exists (status: ${existing.status})`,
      });
      continue;
    }

    plan.push({
      action: "create",
      stableId: draft.stableId,
      fragmentId: fragment.id,
      chars: draft.text.length,
    });
  }

  return plan;
}

function reportPlan(plan: PlannedAction[], options: CliOptions) {
  console.log(`Draft file: ${options.draftFile}`);
  console.log(`Mode: ${options.write ? "WRITE" : "dry run"}\n`);

  for (const item of plan) {
    if (item.action === "create") {
      console.log(`  create  ${item.stableId}  (${item.chars} chars, draft / ai_assisted)`);
    } else {
      console.log(`  skip    ${item.stableId}  — ${item.reason}`);
    }
  }

  const creates = plan.filter((item) => item.action === "create").length;
  console.log(`\nPlanned: ${creates} create(s), ${plan.length - creates} skip(s).`);
}

async function readDraftFile(draftFile: string): Promise<DraftFile> {
  const raw = await readFile(path.resolve(draftFile), "utf8");
  const parsed = JSON.parse(raw) as Partial<DraftFile>;

  if (!parsed.lawSlug || !Array.isArray(parsed.drafts)) {
    throw new Error("Draft file must contain a lawSlug and a drafts array.");
  }

  for (const draft of parsed.drafts) {
    if (!draft.stableId || typeof draft.stableId !== "string") {
      throw new Error("Every draft needs a stableId.");
    }
    if (!draft.text || typeof draft.text !== "string" || draft.text.trim().length < 40) {
      throw new Error(`Draft ${draft.stableId} needs a text of at least 40 characters.`);
    }
  }

  return parsed as DraftFile;
}

export function parseCliOptions(args: string[]): CliOptions {
  const options: CliOptions = { draftFile: DEFAULT_DRAFT_FILE, write: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    // pnpm forwards its own separator; the other law scripts skip it the same way.
    if (arg === "--") {
      continue;
    }

    if (arg === "--draft-file" && next) {
      options.draftFile = next;
      index += 1;
      continue;
    }

    if (arg === "--write") {
      options.write = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.write = false;
      continue;
    }

    if (arg === "--help") {
      printHelpAndExit();
    }

    throw new Error(`Unknown or incomplete option: ${arg}`);
  }

  return options;
}

function printHelpAndExit(): never {
  console.log(`Usage: pnpm law:import:drafts -- [options]

Loads prepared plain-language explanations as NON-PUBLIC ai-assisted drafts.
The script cannot publish: status is always "draft" and origin is always "ai_assisted".

Options:
  --draft-file <path>   Draft JSON file. Default: ${DEFAULT_DRAFT_FILE}
  --write               Apply the plan. Without it the script only reports.
  --dry-run             Explicit dry run (default).
`);
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
