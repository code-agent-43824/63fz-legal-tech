import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient, type FragmentType } from "@prisma/client";
import { HTMLElement, parse } from "node-html-parser";

const DEFAULT_SOURCE_URL =
  "https://normativ.kontur.ru/document?documentId=504436&moduleId=1";
const SOURCE_NAME = "Контур.Норматив";
const LAW_SLUG = "63fz";
const LAW_NUMBER = "63-ФЗ";
const LAW_TITLE = "Федеральный закон от 06.04.2011 N 63-ФЗ «Об электронной подписи»";
const VERSION_ID = "63fz-current-2025-07-31";
const REVISION_DATE = "2025-07-31";
const EFFECTIVE_DATE = "2026-03-01";
const DEFAULT_IMPORT_DIR = ".import/63fz-current";

type CliOptions = {
  dryRun: boolean;
  write: boolean;
  sourceUrl: string;
  sourceFile?: string;
  importDir: string;
  reportFile?: string;
  versionId?: string;
  revisionDate: string;
  effectiveDate: string;
  setCurrent: boolean;
};

type ParsedBlock = {
  stableId: string;
  parentStableId: string | null;
  type: FragmentType;
  number: string | null;
  title: string;
  text: string;
  order: number;
};

type ParsedLaw = {
  preamble: ParsedBlock;
  articles: ParsedBlock[];
  fragments: ParsedBlock[];
  fullText: string;
  revisionDate: string;
  effectiveDate: string;
};

type ImportReport = {
  sourceName: string;
  sourceUrl: string;
  revisionDate: string;
  effectiveDate: string;
  retrievedAt: string;
  htmlSha256: string;
  textSha256: string;
  fragmentCount: number;
  articleCount: number;
  typeCounts: Record<FragmentType, number>;
  articleNumbers: string[];
  reconstructionSha256: string;
  reconstructionMatchesFullText: boolean;
  warnings: string[];
  comparison: {
    added: number;
    changed: number;
    deleted: number;
    unchanged: number;
  } | null;
};

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  await mkdir(options.importDir, { recursive: true });

  const retrievedAt = new Date().toISOString();
  const html = options.sourceFile
    ? await readFile(options.sourceFile, "utf8")
    : await fetchSourceHtml(options.sourceUrl);

  const rawPath = path.join(options.importDir, "source.html");
  await writeFile(rawPath, html);

  const parsed = parseLawHtml(html, {
    effectiveDate: options.effectiveDate,
    revisionDate: options.revisionDate,
  });
  const htmlSha256 = sha256(html);
  const textSha256 = sha256(parsed.fullText);
  const reconstructedFullText = reconstructFullTextFromDetailedFragments(parsed);
  const reconstructionSha256 = sha256(reconstructedFullText);
  const warnings = validateParsedLaw(parsed);
  const versionId = options.versionId ?? buildVersionId(parsed.revisionDate);
  const comparison = await compareWithCurrentVersion(parsed.fragments, versionId);
  const report: ImportReport = {
    sourceName: SOURCE_NAME,
    sourceUrl: options.sourceUrl,
    revisionDate: parsed.revisionDate,
    effectiveDate: parsed.effectiveDate,
    retrievedAt,
    htmlSha256,
    textSha256,
    fragmentCount: parsed.fragments.length,
    articleCount: parsed.articles.length,
    typeCounts: countFragmentTypes(parsed.fragments),
    articleNumbers: parsed.articles.map((article) => article.number ?? article.stableId),
    reconstructionSha256,
    reconstructionMatchesFullText: reconstructedFullText === parsed.fullText,
    warnings,
    comparison,
  };

  const reportText = formatReport(report, options.write);
  const reportPath = options.reportFile ?? path.join(options.importDir, "dry-run-report.md");
  await writeFile(reportPath, reportText);
  console.log(reportText);
  console.log(`\nSaved raw source: ${rawPath}`);
  console.log(`Saved report: ${reportPath}`);

  if (warnings.length > 0) {
    throw new Error("Import stopped: parser warnings must be reviewed first.");
  }

  if (options.write) {
    await writeParsedLaw(parsed, {
      setCurrent: options.setCurrent,
      sourceUrl: options.sourceUrl,
      retrievedAt,
      htmlSha256,
      textSha256,
      versionId,
    });
    console.log("\nDatabase import completed.");
    return;
  }

  if (options.dryRun) {
    console.log("\nDry run only. Re-run with --write to update the database.");
  }
}

function parseCliOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: true,
    write: false,
    sourceUrl: DEFAULT_SOURCE_URL,
    importDir: DEFAULT_IMPORT_DIR,
    revisionDate: REVISION_DATE,
    effectiveDate: EFFECTIVE_DATE,
    setCurrent: true,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--write") {
      options.write = true;
      options.dryRun = false;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
      options.write = false;
    } else if (arg === "--source-url") {
      options.sourceUrl = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--source-file") {
      options.sourceFile = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--import-dir") {
      options.importDir = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--report-file") {
      options.reportFile = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--version-id") {
      options.versionId = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--revision-date") {
      options.revisionDate = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--effective-date") {
      options.effectiveDate = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--no-set-current") {
      options.setCurrent = false;
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
        "Mozilla/5.0 (compatible; 63fz-legal-tech-importer/1.0; +https://mescheryakov.pro/63fz)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch source: HTTP ${response.status}`);
  }

  return response.text();
}

function parseLawHtml(
  html: string,
  metadata: {
    effectiveDate: string;
    revisionDate: string;
  },
): ParsedLaw {
  const root = parse(html, {
    blockTextElements: {
      script: false,
      noscript: false,
      style: false,
      pre: true,
    },
  });
  const content = root.querySelector("#js-doc-text-content-part");

  if (!content) {
    throw new Error("Could not find #js-doc-text-content-part in source HTML.");
  }

  const revisionStatus = normalizeText(
    root.querySelector("#js-revisions-status")?.innerText ?? "",
  );
  if (!revisionStatus.includes(formatRuDate(metadata.revisionDate))) {
    throw new Error(`Unexpected revision status: ${revisionStatus || "(empty)"}`);
  }

  const preambleLines: string[] = [];
  const articles: ParsedBlock[] = [];
  const detailedFragments: ParsedBlock[] = [];
  let currentArticle: ParsedBlock | null = null;
  let currentPart: ParsedBlock | null = null;
  let paragraphIndex = 0;
  let articleChildIndex = 0;

  for (const node of content.childNodes) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }

    const tagName = node.rawTagName.toLowerCase();
    const text = cleanElementText(node);
    if (!text) {
      continue;
    }

    if (tagName === "h3" && /^Статья\s+\d+(?:\.\d+)?\./.test(text)) {
      currentArticle = createArticleBlock(text, articles.length + 1);
      articles.push(currentArticle);
      detailedFragments.push(currentArticle);
      currentPart = null;
      paragraphIndex = 0;
      articleChildIndex = 0;
      continue;
    }

    if (!currentArticle) {
      if (!node.classNames.includes("dt-rp")) {
        preambleLines.push(text);
      }
      continue;
    }

    if (tagName === "p" || tagName === "h2") {
      currentArticle.text = appendParagraph(currentArticle.text, text);
      articleChildIndex += 1;

      const marker = extractMarker(node);
      const childOrder = currentArticle.order + articleChildIndex;
      if (node.classNames.includes("dt-m1") && marker) {
        currentPart = createChildBlock({
          article: currentArticle,
          marker,
          text,
          type: "part",
          order: childOrder,
        });
        detailedFragments.push(currentPart);
        continue;
      }

      if (node.classNames.includes("dt-m2") && marker) {
        detailedFragments.push(
          createChildBlock({
            article: currentArticle,
            marker,
            text,
            type: "point",
            order: childOrder,
            parentStableId: currentPart?.stableId ?? currentArticle.stableId,
          }),
        );
        continue;
      }

      paragraphIndex += 1;
      detailedFragments.push(
        createChildBlock({
          article: currentArticle,
          marker: `${paragraphIndex}`,
          text,
          type: "paragraph",
          order: childOrder,
          parentStableId: currentPart?.stableId ?? currentArticle.stableId,
          title: `${currentArticle.title}. Абзац ${paragraphIndex}`,
        }),
      );
    }
  }

  const preambleText = preambleLines.join("\n");
  const preamble: ParsedBlock = {
    stableId: "63fz.document",
    parentStableId: null,
    type: "law",
    number: LAW_NUMBER,
    title: LAW_TITLE,
    text: preambleText,
    order: 0,
  };

  const fullText = [preambleText, ...articles.map((article) => `${article.title}\n${article.text}`)]
    .filter(Boolean)
    .join("\n\n");

  return {
    preamble,
    articles,
    fragments: [preamble, ...detailedFragments],
    fullText,
    revisionDate: metadata.revisionDate,
    effectiveDate: metadata.effectiveDate,
  };
}

function createArticleBlock(title: string, articleIndex: number): ParsedBlock {
  const match = title.match(/^Статья\s+(\d+(?:\.\d+)?)\.\s*(.+)$/);
  if (!match) {
    throw new Error(`Unexpected article heading: ${title}`);
  }

  const number = match[1];
  return {
    stableId: `63fz.article_${number.replace(".", "_")}`,
    parentStableId: "63fz.document",
    type: "article",
    number,
    title,
    text: "",
    order: articleIndex * 1000,
  };
}

function createChildBlock({
  article,
  marker,
  text,
  type,
  order,
  parentStableId,
  title,
}: {
  article: ParsedBlock;
  marker: string;
  text: string;
  type: Extract<FragmentType, "part" | "point" | "paragraph">;
  order: number;
  parentStableId?: string;
  title?: string;
}): ParsedBlock {
  const markerSlug = slugifyMarker(marker);
  const stableBase = parentStableId ?? article.stableId;
  const stableType = type === "paragraph" ? "paragraph" : type;
  const defaultTitle = formatChildTitle(article.title, type, marker);

  return {
    stableId: `${stableBase}.${stableType}_${markerSlug}`,
    parentStableId: stableBase,
    type,
    number: marker,
    title: title ?? defaultTitle,
    text,
    order,
  };
}

function formatChildTitle(articleTitle: string, type: FragmentType, marker: string) {
  if (type === "part") {
    return `${articleTitle}, часть ${trimMarker(marker)}`;
  }

  if (type === "point") {
    return `${articleTitle}, пункт ${trimMarker(marker)}`;
  }

  return `${articleTitle}, абзац ${trimMarker(marker)}`;
}

function trimMarker(marker: string) {
  return marker.replace(/[.)]+$/, "");
}

function slugifyMarker(marker: string) {
  return trimMarker(marker)
    .toLowerCase()
    .replace(/[а-я]/g, (letter) => {
      const alphabet = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя";
      const index = alphabet.indexOf(letter);
      return index >= 0 ? `ru${index + 1}` : letter;
    })
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");
}

function extractMarker(element: HTMLElement) {
  return normalizeText(element.querySelector(".dt-m")?.innerText ?? "");
}

function cleanElementText(element: HTMLElement) {
  const clone = parse(element.toString()).firstChild as HTMLElement | null;
  if (!clone) {
    return "";
  }

  for (const editorialNote of clone.querySelectorAll(".dt-r, .dt-rc")) {
    editorialNote.remove();
  }

  for (const anchor of clone.querySelectorAll("a")) {
    if (!normalizeText(anchor.innerText)) {
      anchor.remove();
    }
  }

  return normalizeText(clone.text);
}

function normalizeText(text: string) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function appendParagraph(text: string, paragraph: string) {
  if (!text) {
    return paragraph;
  }
  return `${text}\n\n${paragraph}`;
}

function validateParsedLaw(parsed: ParsedLaw) {
  const warnings: string[] = [];
  const expectedArticles = [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "16.1",
    "17",
    "17.1",
    "17.2",
    "17.3",
    "17.4",
    "17.5",
    "17.6",
    "18",
    "18.1",
    "18.2",
    "19",
    "20",
  ];
  const actualArticles = parsed.articles.map((article) => article.number ?? "");

  if (actualArticles.join(",") !== expectedArticles.join(",")) {
    warnings.push(
      `Unexpected article sequence: expected ${expectedArticles.join(", ")}, got ${actualArticles.join(", ")}`,
    );
  }

  for (const article of parsed.articles) {
    if (article.text.length < 20) {
      warnings.push(`Article ${article.number} has suspiciously short text.`);
    }
  }

  const reconstructedFullText = reconstructFullTextFromDetailedFragments(parsed);
  if (reconstructedFullText !== parsed.fullText) {
    warnings.push("Detailed fragments do not reconstruct the normalized full law text.");
  }

  const stableIds = new Set<string>();
  for (const fragment of parsed.fragments) {
    if (stableIds.has(fragment.stableId)) {
      warnings.push(`Duplicate stableId detected: ${fragment.stableId}`);
    }
    stableIds.add(fragment.stableId);

    if (fragment.parentStableId && !parsed.fragments.some((item) => item.stableId === fragment.parentStableId)) {
      warnings.push(`Missing parent ${fragment.parentStableId} for ${fragment.stableId}.`);
    }
  }

  if (!parsed.preamble.text.includes("ОБ ЭЛЕКТРОННОЙ ПОДПИСИ")) {
    warnings.push("Preamble does not contain the law title.");
  }

  if (
    !parsed.fullText.includes("Президент") ||
    !/Д\.\s*МЕДВЕДЕВ/.test(parsed.fullText)
  ) {
    warnings.push("Final signature block was not detected.");
  }

  return warnings;
}

function reconstructFullTextFromDetailedFragments(parsed: ParsedLaw) {
  const articleTexts = parsed.articles.map((article) => {
    const articleChildren = parsed.fragments
      .filter((fragment) => isDetailedArticleChild(fragment, article.stableId))
      .sort((left, right) => left.order - right.order)
      .map((fragment) => fragment.text)
      .join("\n\n");

    return [article.title, articleChildren].filter(Boolean).join("\n");
  });

  return [parsed.preamble.text, ...articleTexts].filter(Boolean).join("\n\n");
}

function isDetailedArticleChild(fragment: ParsedBlock, articleStableId: string) {
  if (fragment.stableId === articleStableId) {
    return false;
  }

  return fragment.stableId.startsWith(`${articleStableId}.`);
}

function countFragmentTypes(fragments: ParsedBlock[]) {
  return fragments.reduce<Record<FragmentType, number>>(
    (counts, fragment) => {
      counts[fragment.type] += 1;
      return counts;
    },
    {
      law: 0,
      chapter: 0,
      article: 0,
      part: 0,
      point: 0,
      paragraph: 0,
    },
  );
}

function formatReport(report: ImportReport, writeMode: boolean) {
  const warningLines =
    report.warnings.length === 0
      ? "- none"
      : report.warnings.map((warning) => `- ${warning}`).join("\n");

  return `# 63-FZ Current Text Import ${writeMode ? "Write Report" : "Dry Run"}

- Source: ${report.sourceName}
- Source URL: ${report.sourceUrl}
- Revision date: ${report.revisionDate}
- Effective date: ${report.effectiveDate}
- Retrieved at: ${report.retrievedAt}
- Source HTML SHA-256: ${report.htmlSha256}
- Normalized law text SHA-256: ${report.textSha256}
- Detailed reconstruction SHA-256: ${report.reconstructionSha256}
- Detailed reconstruction matches normalized text: ${report.reconstructionMatchesFullText ? "yes" : "no"}
- Fragment count: ${report.fragmentCount}
- Article count: ${report.articleCount}
- Type counts: ${formatTypeCounts(report.typeCounts)}
- Article sequence: ${report.articleNumbers.join(", ")}
- Comparison with current version: ${formatComparison(report.comparison)}

Warnings:

${warningLines}
`;
}

function formatTypeCounts(typeCounts: Record<FragmentType, number>) {
  return Object.entries(typeCounts)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${type} ${count}`)
    .join(", ");
}

function formatComparison(comparison: ImportReport["comparison"]) {
  if (!comparison) {
    return "not available";
  }

  return [
    `unchanged ${comparison.unchanged}`,
    `changed ${comparison.changed}`,
    `added ${comparison.added}`,
    `deleted ${comparison.deleted}`,
  ].join(", ");
}

async function compareWithCurrentVersion(fragments: ParsedBlock[], versionId: string) {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  const prisma = new PrismaClient();
  try {
    const law = await prisma.law.findUnique({
      where: { slug: LAW_SLUG },
      include: {
        currentVersion: {
          include: {
            fragments: true,
          },
        },
      },
    });

    if (!law?.currentVersion || law.currentVersion.id === versionId) {
      return null;
    }

    const currentByStableId = new Map(
      law.currentVersion.fragments.map((fragment) => [fragment.stableId, fragment.text]),
    );
    const importedStableIds = new Set(fragments.map((fragment) => fragment.stableId));
    const summary = {
      added: 0,
      changed: 0,
      deleted: 0,
      unchanged: 0,
    };

    for (const fragment of fragments) {
      const currentText = currentByStableId.get(fragment.stableId);
      if (currentText === undefined) {
        summary.added += 1;
      } else if (normalizeForComparison(currentText) === normalizeForComparison(fragment.text)) {
        summary.unchanged += 1;
      } else {
        summary.changed += 1;
      }
    }

    for (const stableId of currentByStableId.keys()) {
      if (!importedStableIds.has(stableId)) {
        summary.deleted += 1;
      }
    }

    return summary;
  } finally {
    await prisma.$disconnect();
  }
}

async function writeParsedLaw(
  parsed: ParsedLaw,
  source: {
    setCurrent: boolean;
    sourceUrl: string;
    retrievedAt: string;
    htmlSha256: string;
    textSha256: string;
    versionId: string;
  },
) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when --write is used.");
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      const law = await tx.law.upsert({
        where: { slug: LAW_SLUG },
        update: {
          title: LAW_TITLE,
          number: LAW_NUMBER,
        },
        create: {
          slug: LAW_SLUG,
          title: LAW_TITLE,
          number: LAW_NUMBER,
        },
      });

      const version = await tx.lawVersion.upsert({
        where: { id: source.versionId },
        update: {
          lawId: law.id,
          title: `${LAW_TITLE} (ред. от ${formatRuDate(parsed.revisionDate)})`,
          effectiveDate: new Date(`${parsed.effectiveDate}T00:00:00.000Z`),
          sourceUrl: source.sourceUrl,
          sourceName: SOURCE_NAME,
          sourceRetrievedAt: new Date(source.retrievedAt),
          sourceHtmlSha256: source.htmlSha256,
          sourceTextSha256: source.textSha256,
          status: "published",
        },
        create: {
          id: source.versionId,
          lawId: law.id,
          title: `${LAW_TITLE} (ред. от ${formatRuDate(parsed.revisionDate)})`,
          effectiveDate: new Date(`${parsed.effectiveDate}T00:00:00.000Z`),
          sourceUrl: source.sourceUrl,
          sourceName: SOURCE_NAME,
          sourceRetrievedAt: new Date(source.retrievedAt),
          sourceHtmlSha256: source.htmlSha256,
          sourceTextSha256: source.textSha256,
          status: "published",
        },
      });

      const writtenStableIds: string[] = [];
      const fragmentIdsByStableId = new Map<string, string>();

      const preambleRecord = await tx.lawFragment.upsert({
        where: {
          lawVersionId_stableId: {
            lawVersionId: version.id,
            stableId: parsed.preamble.stableId,
          },
        },
        update: {
          parentId: null,
          type: parsed.preamble.type,
          number: parsed.preamble.number,
          title: parsed.preamble.title,
          text: parsed.preamble.text,
          order: parsed.preamble.order,
          anchor: parsed.preamble.stableId,
        },
        create: {
          lawVersionId: version.id,
          stableId: parsed.preamble.stableId,
          type: parsed.preamble.type,
          number: parsed.preamble.number,
          title: parsed.preamble.title,
          text: parsed.preamble.text,
          order: parsed.preamble.order,
          anchor: parsed.preamble.stableId,
        },
      });
      writtenStableIds.push(parsed.preamble.stableId);
      fragmentIdsByStableId.set(parsed.preamble.stableId, preambleRecord.id);

      for (const article of parsed.articles) {
        const articleRecord = await tx.lawFragment.upsert({
          where: {
            lawVersionId_stableId: {
              lawVersionId: version.id,
              stableId: article.stableId,
            },
          },
          update: {
            parentId: fragmentIdsByStableId.get("63fz.document") ?? null,
            type: article.type,
            number: article.number,
            title: article.title,
            text: article.text,
            order: article.order,
            anchor: article.stableId,
          },
          create: {
            lawVersionId: version.id,
            stableId: article.stableId,
            parentId: fragmentIdsByStableId.get("63fz.document") ?? null,
            type: article.type,
            number: article.number,
            title: article.title,
            text: article.text,
            order: article.order,
            anchor: article.stableId,
          },
        });
        writtenStableIds.push(article.stableId);
        fragmentIdsByStableId.set(article.stableId, articleRecord.id);
      }

      const detailedChildren = parsed.fragments.filter(
        (fragment) => fragment.type !== "law" && fragment.type !== "article",
      );

      for (const fragment of detailedChildren) {
        const parentId = fragment.parentStableId
          ? (fragmentIdsByStableId.get(fragment.parentStableId) ?? null)
          : null;

        const fragmentRecord = await tx.lawFragment.upsert({
          where: {
            lawVersionId_stableId: {
              lawVersionId: version.id,
              stableId: fragment.stableId,
            },
          },
          update: {
            parentId,
            type: fragment.type,
            number: fragment.number,
            title: fragment.title,
            text: fragment.text,
            order: fragment.order,
            anchor: fragment.stableId,
          },
          create: {
            lawVersionId: version.id,
            stableId: fragment.stableId,
            parentId,
            type: fragment.type,
            number: fragment.number,
            title: fragment.title,
            text: fragment.text,
            order: fragment.order,
            anchor: fragment.stableId,
          },
        });
        writtenStableIds.push(fragment.stableId);
        fragmentIdsByStableId.set(fragment.stableId, fragmentRecord.id);
      }

      await tx.lawFragment.deleteMany({
        where: {
          lawVersionId: version.id,
          stableId: { notIn: writtenStableIds },
        },
      });

      if (source.setCurrent) {
        await tx.law.update({
          where: { id: law.id },
          data: { currentVersionId: version.id },
        });
      }
    }, { timeout: 60_000 });
  } finally {
    await prisma.$disconnect();
  }
}

function formatRuDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function buildVersionId(revisionDate: string) {
  if (revisionDate === "2025-07-31") {
    return VERSION_ID;
  }

  return `63fz-revision-${revisionDate}`;
}

function normalizeForComparison(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
