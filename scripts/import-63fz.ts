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
};

type ParsedBlock = {
  stableId: string;
  type: FragmentType;
  number: string | null;
  title: string;
  text: string;
  order: number;
};

type ParsedLaw = {
  preamble: ParsedBlock;
  articles: ParsedBlock[];
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
  articleNumbers: string[];
  warnings: string[];
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

  const parsed = parseLawHtml(html);
  const htmlSha256 = sha256(html);
  const textSha256 = sha256(parsed.fullText);
  const warnings = validateParsedLaw(parsed);
  const report: ImportReport = {
    sourceName: SOURCE_NAME,
    sourceUrl: options.sourceUrl,
    revisionDate: parsed.revisionDate,
    effectiveDate: parsed.effectiveDate,
    retrievedAt,
    htmlSha256,
    textSha256,
    fragmentCount: parsed.articles.length + 1,
    articleCount: parsed.articles.length,
    articleNumbers: parsed.articles.map((article) => article.number ?? article.stableId),
    warnings,
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
      sourceUrl: options.sourceUrl,
      retrievedAt,
      htmlSha256,
      textSha256,
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

function parseLawHtml(html: string): ParsedLaw {
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
  if (!revisionStatus.includes("31.07.2025") || !revisionStatus.includes("01.03.2026")) {
    throw new Error(`Unexpected revision status: ${revisionStatus || "(empty)"}`);
  }

  const preambleLines: string[] = [];
  const articles: ParsedBlock[] = [];
  let currentArticle: ParsedBlock | null = null;

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
    }
  }

  const preambleText = preambleLines.join("\n");
  const preamble: ParsedBlock = {
    stableId: "63fz.document",
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
    fullText,
    revisionDate: REVISION_DATE,
    effectiveDate: EFFECTIVE_DATE,
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
    type: "article",
    number,
    title,
    text: "",
    order: articleIndex * 10,
  };
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

  return normalizeText(clone.innerText);
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

  if (!parsed.preamble.text.includes("ОБ ЭЛЕКТРОННОЙ ПОДПИСИ")) {
    warnings.push("Preamble does not contain the law title.");
  }

  if (!parsed.fullText.includes("Президент") || !parsed.fullText.includes("Д. МЕДВЕДЕВ")) {
    warnings.push("Final signature block was not detected.");
  }

  return warnings;
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
- Fragment count: ${report.fragmentCount}
- Article count: ${report.articleCount}
- Article sequence: ${report.articleNumbers.join(", ")}

Warnings:

${warningLines}
`;
}

async function writeParsedLaw(
  parsed: ParsedLaw,
  source: {
    sourceUrl: string;
    retrievedAt: string;
    htmlSha256: string;
    textSha256: string;
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
        where: { id: VERSION_ID },
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
          id: VERSION_ID,
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

      await tx.lawFragment.deleteMany({
        where: { lawVersionId: version.id },
      });

      await tx.lawFragment.create({
        data: {
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

      for (const article of parsed.articles) {
        await tx.lawFragment.create({
          data: {
            lawVersionId: version.id,
            stableId: article.stableId,
            type: article.type,
            number: article.number,
            title: article.title,
            text: article.text,
            order: article.order,
            anchor: article.stableId,
          },
        });
      }

      await tx.law.update({
        where: { id: law.id },
        data: { currentVersionId: version.id },
      });
    });
  } finally {
    await prisma.$disconnect();
  }
}

function formatRuDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
