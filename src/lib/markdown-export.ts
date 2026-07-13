import { lawVersionOrderByDescending } from "@/lib/law-version-order";
import { PUBLIC_LAW_SLUG, PUBLIC_VERSION_STATUSES } from "@/lib/law-scope";
import { PUBLIC_READER_STATUSES } from "@/lib/publication-policy";
import { prisma } from "@/lib/prisma";
import { makeSafeSourceLink, parseSafeSourceLinks } from "@/lib/source-links";

export type MarkdownExportFragment = {
  stableId: string;
  parentStableId: string | null;
  type: string;
  title: string;
  text: string;
  plainExplanations: Array<{ text: string; authorName: string | null }>;
  expertComments: Array<{ expertName: string; expertTitle: string | null; text: string }>;
  issues: Array<{ severity: string; title: string; description: string }>;
  proposedRevisions: Array<{ proposedText: string; rationale: string }>;
  changeExplanations: Array<{
    fromVersionLabel: string;
    toVersionLabel: string;
    reason: string | null;
    purpose: string | null;
    practicalMeaning: string | null;
    sourceLinks: string | null;
  }>;
};

export type MarkdownExportData = {
  lawTitle: string;
  versionLabel: string;
  versionId: string;
  isCurrent: boolean;
  effectiveDate: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceRetrievedAt: string | null;
  sourceTextSha256: string | null;
  fragments: MarkdownExportFragment[];
};

type DbFragment = {
  id: string;
  parentId: string | null;
  stableId: string;
  type: string;
  title: string | null;
  text: string;
  plainExplanations: Array<{ text: string; authorName: string | null }>;
  expertComments: Array<{ expertName: string; expertTitle: string | null; text: string }>;
  issues: Array<{ severity: string; title: string; description: string }>;
  proposedRevisions: Array<{ proposedText: string; rationale: string }>;
};

export async function getMarkdownExportData(versionId?: string): Promise<MarkdownExportData | null> {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  const law = await prisma.law.findUnique({
    where: { slug: PUBLIC_LAW_SLUG },
    include: {
      currentVersion: true,
      versions: {
        where: { status: { in: [...PUBLIC_VERSION_STATUSES] } },
        orderBy: lawVersionOrderByDescending,
      },
    },
  });

  if (!law) {
    return null;
  }

  const versions = law.versions.filter((version) => !isDemoVersion(version.title));
  const selectedVersion =
    versions.find((version) => version.id === versionId) ??
    law.currentVersion ??
    versions[0] ??
    null;

  if (!selectedVersion || isDemoVersion(selectedVersion.title)) {
    return null;
  }

  const fragments = await prisma.lawFragment.findMany({
    where: { lawVersionId: selectedVersion.id },
    orderBy: { order: "asc" },
    include: {
      plainExplanations: {
        where: { status: PUBLIC_READER_STATUSES.plainExplanation },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        select: { authorName: true, text: true },
      },
      expertComments: {
        where: { status: PUBLIC_READER_STATUSES.expertComment },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        select: { expertName: true, expertTitle: true, text: true },
      },
      issues: {
        where: { status: PUBLIC_READER_STATUSES.issue },
        orderBy: [{ severity: "desc" }, { updatedAt: "desc" }, { id: "asc" }],
        select: { description: true, severity: true, title: true },
      },
      proposedRevisions: {
        where: { status: PUBLIC_READER_STATUSES.proposedRevision },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        select: { proposedText: true, rationale: true },
      },
    },
  });

  if (fragments.length === 0) {
    return null;
  }

  const displayFragments = removeAggregateArticleFragments(fragments);
  const displayStableIds = displayFragments.map((fragment) => fragment.stableId);
  const changeExplanations = await prisma.fragmentChangeExplanation.findMany({
    where: {
      status: PUBLIC_READER_STATUSES.changeExplanation,
      stableId: { in: displayStableIds },
      fromVersion: { lawId: law.id },
      toVersion: { lawId: law.id },
    },
    orderBy: [{ fromVersionId: "asc" }, { toVersionId: "asc" }, { stableId: "asc" }],
    include: {
      fromVersion: true,
      toVersion: true,
    },
  });
  const changeExplanationsByStableId = new Map<
    string,
    MarkdownExportFragment["changeExplanations"]
  >();

  for (const explanation of changeExplanations) {
    const current = changeExplanationsByStableId.get(explanation.stableId) ?? [];
    current.push({
      fromVersionLabel: formatVersionLabel(
        explanation.fromVersion.title,
        explanation.fromVersion.effectiveDate,
      ),
      toVersionLabel: formatVersionLabel(explanation.toVersion.title, explanation.toVersion.effectiveDate),
      reason: explanation.reason,
      purpose: explanation.purpose,
      practicalMeaning: explanation.practicalMeaning,
      sourceLinks: explanation.sourceLinks,
    });
    changeExplanationsByStableId.set(explanation.stableId, current);
  }

  const stableIdsById = new Map(fragments.map((fragment) => [fragment.id, fragment.stableId]));

  return {
    lawTitle: law.title,
    versionLabel: formatVersionLabel(selectedVersion.title, selectedVersion.effectiveDate),
    versionId: selectedVersion.id,
    isCurrent: selectedVersion.id === law.currentVersionId,
    effectiveDate: formatDate(selectedVersion.effectiveDate),
    sourceName: selectedVersion.sourceName,
    sourceUrl: makeSafeSourceLink(selectedVersion.sourceUrl, selectedVersion.sourceName)?.href ?? null,
    sourceRetrievedAt: formatDate(selectedVersion.sourceRetrievedAt),
    sourceTextSha256: selectedVersion.sourceTextSha256,
    fragments: displayFragments.map((fragment) => ({
      stableId: fragment.stableId,
      parentStableId: fragment.parentId ? (stableIdsById.get(fragment.parentId) ?? null) : null,
      type: fragment.type,
      title: formatFragmentTitle(fragment.title, fragment.stableId),
      text: fragment.text,
      plainExplanations: fragment.plainExplanations,
      expertComments: fragment.expertComments,
      issues: fragment.issues,
      proposedRevisions: fragment.proposedRevisions,
      changeExplanations: changeExplanationsByStableId.get(fragment.stableId) ?? [],
    })),
  };
}

export function buildMarkdownExport(data: MarkdownExportData) {
  const lines: string[] = [
    `# ${escapeMarkdownHeading(data.lawTitle)}`,
    "",
    "## Метаданные",
    "",
    `- Редакция: ${escapeMarkdownInline(data.versionLabel)}`,
    `- ID редакции: \`${escapeBackticks(data.versionId)}\``,
    `- Статус редакции: ${data.isCurrent ? "текущая" : "историческая"}`,
    `- Дата начала действия: ${data.effectiveDate ?? "не указана"}`,
    `- Источник текста: ${formatSource(data)}`,
    `- Дата проверки источника: ${data.sourceRetrievedAt ?? "не указана"}`,
    `- SHA-256 нормализованного текста: ${data.sourceTextSha256 ? `\`${escapeBackticks(data.sourceTextSha256)}\`` : "не указан"}`,
    "",
    "## Важно о структуре",
    "",
    "Официальный текст закона и редакционные материалы разделены. Предложенные редакции ниже не заменяют официальный текст; они приведены отдельными блоками.",
    "",
    "## Официальный текст и редакционные материалы",
    "",
  ];

  for (const fragment of data.fragments) {
    appendFragment(lines, fragment);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function appendFragment(lines: string[], fragment: MarkdownExportFragment) {
  lines.push(`${headingPrefix(fragment.type)} ${escapeMarkdownHeading(fragment.title)}`);
  lines.push("");
  lines.push(`- stableId: \`${escapeBackticks(fragment.stableId)}\``);
  if (fragment.parentStableId) {
    lines.push(`- parentStableId: \`${escapeBackticks(fragment.parentStableId)}\``);
  }
  lines.push(`- Тип: ${escapeMarkdownInline(formatType(fragment.type))}`);
  lines.push("");
  lines.push("### Официальный текст");
  lines.push("");
  lines.push(formatParagraph(fragment.text));

  if (fragment.plainExplanations.length > 0) {
    lines.push("");
    lines.push("### Простыми словами");
    for (const explanation of fragment.plainExplanations) {
      lines.push("");
      lines.push(`- ${formatParagraph(explanation.text)}`);
      if (explanation.authorName) {
        lines.push(`  Автор: ${escapeMarkdownInline(explanation.authorName)}`);
      }
    }
  }

  if (fragment.expertComments.length > 0) {
    lines.push("");
    lines.push("### Комментарии экспертов");
    for (const comment of fragment.expertComments) {
      const expertTitle = comment.expertTitle ? `, ${comment.expertTitle}` : "";
      lines.push("");
      lines.push(`- ${escapeMarkdownInline(comment.expertName)}${escapeMarkdownInline(expertTitle)}: ${formatParagraph(comment.text)}`);
    }
  }

  if (fragment.issues.length > 0) {
    lines.push("");
    lines.push("### Подтвержденные проблемы");
    for (const issue of fragment.issues) {
      lines.push("");
      lines.push(`- ${escapeMarkdownInline(issue.title)} (${escapeMarkdownInline(issue.severity)}): ${formatParagraph(issue.description)}`);
    }
  }

  if (fragment.changeExplanations.length > 0) {
    lines.push("");
    lines.push("### Пояснения к изменениям");
    for (const explanation of fragment.changeExplanations) {
      lines.push("");
      lines.push(`- Переход: ${escapeMarkdownInline(explanation.fromVersionLabel)} -> ${escapeMarkdownInline(explanation.toVersionLabel)}`);
      appendOptionalNestedLine(lines, "Причина", explanation.reason);
      appendOptionalNestedLine(lines, "Цель", explanation.purpose);
      appendOptionalNestedLine(lines, "Практический смысл", explanation.practicalMeaning);
      const sourceLinks = parseSafeSourceLinks(explanation.sourceLinks);
      if (sourceLinks.length > 0) {
        lines.push(
          `  Источники: ${sourceLinks
            .map((link) => `[${escapeMarkdownInline(link.label)}](${link.href})`)
            .join(", ")}`,
        );
      }
    }
  }

  if (fragment.proposedRevisions.length > 0) {
    lines.push("");
    lines.push("### Принятые предложенные редакции");
    for (const revision of fragment.proposedRevisions) {
      lines.push("");
      lines.push("Официальный текст не заменен. Принятое предложение:");
      lines.push("");
      lines.push(formatParagraph(revision.proposedText));
      lines.push("");
      lines.push(`Обоснование: ${formatParagraph(revision.rationale)}`);
    }
  }

  lines.push("");
}

function appendOptionalNestedLine(lines: string[], label: string, value: string | null) {
  const text = value?.trim();
  if (!text) {
    return;
  }

  lines.push(`  ${label}: ${formatParagraph(text)}`);
}

function removeAggregateArticleFragments(fragments: DbFragment[]) {
  const parentIds = new Set(fragments.map((fragment) => fragment.parentId).filter(Boolean));
  return fragments.filter((fragment) => {
    if (!fragment.text.trim()) {
      return false;
    }

    return fragment.type !== "article" || !parentIds.has(fragment.id);
  });
}

function formatVersionLabel(title: string, effectiveDate: Date | null) {
  const titleDate = title.match(/ред\.\s+от\s+([^)]+)/i)?.[1];
  const effective = effectiveDate ? `, действует с ${formatDate(effectiveDate)}` : "";
  return titleDate ? `Ред. от ${titleDate}${effective}` : `${title}${effective}`;
}

function formatDate(date: Date | null) {
  if (!date) {
    return null;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatFragmentTitle(title: string | null, stableId: string) {
  return title?.trim() || stableId;
}

function formatSource(data: MarkdownExportData) {
  if (!data.sourceUrl) {
    return data.sourceName ? escapeMarkdownInline(data.sourceName) : "не указан";
  }

  const label = data.sourceName ?? data.sourceUrl;
  return `[${escapeMarkdownInline(label)}](${data.sourceUrl})`;
}

function formatParagraph(value: string) {
  return value
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n/g, "\n\n");
}

function headingPrefix(type: string) {
  if (type === "law") {
    return "##";
  }

  if (type === "article") {
    return "##";
  }

  return "###";
}

function formatType(type: string) {
  const labels: Record<string, string> = {
    law: "закон",
    article: "статья",
    part: "часть",
    point: "пункт",
    paragraph: "абзац",
  };
  return labels[type] ?? type;
}

function escapeMarkdownHeading(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/#/g, "\\#").trim();
}

function escapeMarkdownInline(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]").trim();
}

function escapeBackticks(value: string) {
  return value.replace(/`/g, "\\`");
}

function isDemoVersion(title: string) {
  return title.toUpperCase().includes("DEMO DATA");
}
