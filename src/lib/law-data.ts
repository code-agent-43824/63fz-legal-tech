import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type FragmentChangeStatus = "current" | "unchanged" | "changed" | "deleted";
type CommentarySource = "selected" | "current" | "none";

export type ReaderChangeHistoryEntry = {
  status: "introduced" | "changed" | "deleted";
  stableId: string;
  fromVersionId: string;
  toVersionId: string;
  versionId: string;
  versionLabel: string;
  previousVersionLabel: string | null;
  beforeSnippet: string | null;
  afterSnippet: string | null;
  reason: string;
  purpose: string;
  practicalMeaning: string;
  sourceLinks: string | null;
};

export type ReaderCommentBlock = {
  title: string;
  text: string;
};

export type ReaderFragment = {
  id: string;
  stableId: string;
  parentStableId: string | null;
  type: string;
  title: string;
  text: string;
  changeStatus: FragmentChangeStatus;
  commentarySource: CommentarySource;
  changeHistory: ReaderChangeHistoryEntry[];
  blocks: ReaderCommentBlock[];
};

export type ReaderTocItem = {
  id: string;
  stableId: string;
  parentStableId: string | null;
  title: string;
  type: string;
};

export type ReaderVersion = {
  id: string;
  title: string;
  label: string;
  effectiveDate: string | null;
  status: string;
  isCurrent: boolean;
};

export type ReaderData = {
  isDemo: boolean;
  versions: ReaderVersion[];
  selectedVersionId: string | null;
  currentVersionId: string | null;
  selectedVersionLabel: string | null;
  toc: ReaderTocItem[];
  fragments: ReaderFragment[];
  changeSummary: {
    introduced: number;
    unchanged: number;
    changed: number;
    deleted: number;
  };
};

type ReaderDbFragment = {
  anchor: string;
  expertComments: Array<{ expertName: string; expertTitle: string | null; text: string }>;
  id: string;
  issues: Array<{ severity: string; title: string; description: string }>;
  parentId: string | null;
  plainExplanations: Array<{ text: string }>;
  proposedRevisions: Array<{ proposedText: string }>;
  stableId: string;
  text: string;
  title: string | null;
  type: string;
};

type ReaderDbChangeExplanation = {
  fromVersionId: string;
  practicalMeaning: string | null;
  purpose: string | null;
  reason: string | null;
  sourceLinks: string | null;
  stableId: string;
  toVersionId: string;
};

const fragmentInclude = Prisma.validator<Prisma.LawFragmentInclude>()({
  plainExplanations: {
    where: { status: "published" },
    orderBy: { updatedAt: "desc" },
  },
  expertComments: {
    where: { status: "published" },
    orderBy: { updatedAt: "desc" },
  },
  issues: {
    where: { status: { in: ["hypothesis", "confirmed"] } },
    orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
  },
  proposedRevisions: {
    where: { status: { in: ["draft", "proposed", "accepted"] } },
    orderBy: { updatedAt: "desc" },
  },
});

export async function getReaderData(requestedVersionId?: string): Promise<ReaderData> {
  if (!process.env.DATABASE_URL) {
    return getDemoReaderData();
  }

  const law = await prisma.law.findUnique({
    where: { slug: "63fz" },
    include: {
      currentVersion: {
        include: {
          fragments: {
            orderBy: { order: "asc" },
            include: fragmentInclude,
          },
        },
      },
      versions: {
        where: { status: { in: ["published", "archived"] } },
        orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
        include: {
          fragments: {
            orderBy: { order: "asc" },
            include: fragmentInclude,
          },
        },
      },
    },
  });

  const currentVersion = law?.currentVersion ?? null;
  const versions = (law?.versions ?? []).filter((version) => !isDemoVersion(version.title));
  const selectedVersion =
    versions.find((version) => version.id === requestedVersionId) ??
    currentVersion ??
    versions[0] ??
    null;
  const fragments = selectedVersion?.fragments ?? [];
  const currentFragments = currentVersion?.fragments ?? [];
  const changeExplanations = law
    ? await prisma.fragmentChangeExplanation.findMany({
        where: {
          status: "published",
          fromVersion: { lawId: law.id },
          toVersion: { lawId: law.id },
        },
      })
    : [];

  if (fragments.length === 0) {
    return getDemoReaderData();
  }

  const parentIds = getParentIds(fragments);
  const stableIdsById = new Map(fragments.map((fragment) => [fragment.id, fragment.stableId]));
  const currentFragmentsByStableId = new Map(
    currentFragments.map((fragment) => [fragment.stableId, fragment]),
  );
  const changeHistoriesByStableId = buildChangeHistoriesByStableId(
    versions,
    changeExplanations,
  );
  const displayFragments = fragments.filter((fragment) => {
    if (!fragment.text.trim()) {
      return false;
    }

    return fragment.type !== "article" || !parentIds.has(fragment.id);
  });

  return {
    isDemo: law?.title.includes("DEMO DATA") ?? false,
    versions: versions.map((version) => ({
      id: version.id,
      title: version.title,
      label: formatVersionLabel(version.title, version.effectiveDate),
      effectiveDate: version.effectiveDate?.toISOString() ?? null,
      status: version.status,
      isCurrent: version.id === currentVersion?.id,
    })),
    selectedVersionId: selectedVersion?.id ?? null,
    currentVersionId: currentVersion?.id ?? null,
    selectedVersionLabel: selectedVersion
      ? formatVersionLabel(selectedVersion.title, selectedVersion.effectiveDate)
      : null,
    toc: buildToc(fragments, displayFragments),
    fragments: displayFragments.map((fragment) =>
      mapReaderFragment({
        currentFragment: currentFragmentsByStableId.get(fragment.stableId) ?? null,
        currentVersionId: currentVersion?.id ?? null,
        fragment,
        changeHistory: changeHistoriesByStableId.get(fragment.stableId) ?? [],
        selectedVersionId: selectedVersion?.id ?? null,
        stableIdsById,
      }),
    ),
    changeSummary: summarizeChanges(displayFragments, currentFragmentsByStableId, {
      currentVersionId: currentVersion?.id ?? null,
      selectedVersionId: selectedVersion?.id ?? null,
    }),
  };
}

function isDemoVersion(title: string) {
  return title.toUpperCase().includes("DEMO DATA");
}

function getDemoReaderData(): ReaderData {
  return {
    isDemo: true,
    versions: [],
    selectedVersionId: null,
    currentVersionId: null,
    selectedVersionLabel: "DEMO DATA",
    toc: [
      {
        id: "63fz.article_1",
        stableId: "63fz.article_1",
        parentStableId: null,
        title: "Статья 1. Сфера действия",
        type: "article",
      },
      {
        id: "63fz.article_2.part_1",
        stableId: "63fz.article_2.part_1",
        parentStableId: "63fz.article_2",
        title: "Статья 2, часть 1. Основные понятия",
        type: "part",
      },
    ],
    fragments: [
      {
        id: "63fz.article_1",
        stableId: "63fz.article_1",
        parentStableId: null,
        type: "article",
        title: "Статья 1. Сфера действия",
        text: "DEMO DATA: здесь будет неизменяемый официальный текст выбранной версии закона.",
        changeStatus: "current",
        commentarySource: "selected",
        changeHistory: [],
        blocks: [
          { title: "Простыми словами", text: "Пояснение пока не добавлено." },
          { title: "Комментарии экспертов", text: "Пока не добавлено." },
          { title: "Ошибки и спорные места", text: "Пока не добавлено." },
          { title: "Предложенная редакция", text: "Пока не добавлено." },
        ],
      },
      {
        id: "63fz.article_2.part_1",
        stableId: "63fz.article_2.part_1",
        parentStableId: "63fz.article_2",
        type: "part",
        title: "Статья 2, часть 1. Основные понятия",
        text: "DEMO DATA: фрагмент нужен только для проверки структуры, якорей и двухколоночного интерфейса.",
        changeStatus: "current",
        commentarySource: "selected",
        changeHistory: [],
        blocks: [
          { title: "Простыми словами", text: "Комментариев экспертов пока нет." },
          { title: "Комментарии экспертов", text: "Пока не добавлено." },
          { title: "Ошибки и спорные места", text: "Пока не добавлено." },
          { title: "Предложенная редакция", text: "Пока не добавлено." },
        ],
      },
    ],
    changeSummary: {
      introduced: 0,
      unchanged: 0,
      changed: 0,
      deleted: 0,
    },
  };
}

function mapReaderFragment({
  currentFragment,
  currentVersionId,
  changeHistory,
  fragment,
  selectedVersionId,
  stableIdsById,
}: {
  currentFragment: ReaderDbFragment | null;
  currentVersionId: string | null;
  changeHistory: ReaderChangeHistoryEntry[];
  fragment: ReaderDbFragment;
  selectedVersionId: string | null;
  stableIdsById: Map<string, string>;
}): ReaderFragment {
  const isCurrentVersion = Boolean(currentVersionId && selectedVersionId === currentVersionId);
  const changeStatus = getFragmentChangeStatus(fragment, currentFragment, isCurrentVersion);
  const commentaryFragment = changeStatus === "unchanged" && currentFragment ? currentFragment : fragment;
  const commentarySource = getCommentarySource(fragment, commentaryFragment, changeStatus);

  return {
    id: fragment.anchor,
    stableId: fragment.stableId,
    parentStableId: fragment.parentId ? (stableIdsById.get(fragment.parentId) ?? null) : null,
    type: fragment.type,
    title: formatFragmentTitle(fragment.title, fragment.stableId),
    text: fragment.text,
    changeStatus,
    commentarySource,
    changeHistory,
    blocks: buildCommentBlocks(commentaryFragment),
  };
}

function buildChangeHistoriesByStableId(
  versions: Array<{
    effectiveDate: Date | null;
    fragments: ReaderDbFragment[];
    id: string;
    title: string;
  }>,
  changeExplanations: ReaderDbChangeExplanation[],
) {
  const histories = new Map<string, ReaderChangeHistoryEntry[]>();
  const chronologicalVersions = [...versions].sort(compareVersionsAscending);
  const explanationsByTransition = new Map(
    changeExplanations.map((explanation) => [transitionKey(explanation), explanation]),
  );

  for (let index = 1; index < chronologicalVersions.length; index += 1) {
    const previousVersion = chronologicalVersions[index - 1];
    const version = chronologicalVersions[index];
    const previousVersionLabel = formatVersionLabel(
      previousVersion.title,
      previousVersion.effectiveDate,
    );
    const versionLabel = formatVersionLabel(version.title, version.effectiveDate);
    const previousFragmentsByStableId = new Map(
      previousVersion.fragments.map((fragment) => [fragment.stableId, fragment]),
    );
    const fragmentsByStableId = new Map(
      version.fragments.map((fragment) => [fragment.stableId, fragment]),
    );
    const stableIds = new Set([
      ...previousFragmentsByStableId.keys(),
      ...fragmentsByStableId.keys(),
    ]);

    for (const stableId of stableIds) {
      const previousFragment = previousFragmentsByStableId.get(stableId) ?? null;
      const fragment = fragmentsByStableId.get(stableId) ?? null;
      const changeType = getHistoryChangeType(previousFragment, fragment);
      if (!changeType) {
        continue;
      }

      const snippets = summarizeHistoryText(changeType, previousFragment, fragment);
      const entries = histories.get(stableId) ?? [];
      const explanation = explanationsByTransition.get(
        transitionKey({
          fromVersionId: previousVersion.id,
          stableId,
          toVersionId: version.id,
        }),
      );
      entries.push({
        status: changeType,
        stableId,
        fromVersionId: previousVersion.id,
        toVersionId: version.id,
        versionId: version.id,
        versionLabel,
        previousVersionLabel,
        beforeSnippet: snippets.before,
        afterSnippet: snippets.after,
        reason: explanation?.reason?.trim() || defaultReason(changeType),
        purpose: explanation?.purpose?.trim() || defaultPurpose(changeType),
        practicalMeaning: explanation?.practicalMeaning?.trim() || defaultPracticalMeaning(changeType),
        sourceLinks: explanation?.sourceLinks?.trim() || null,
      });
      histories.set(stableId, entries);
    }
  }

  return histories;
}

function transitionKey({
  fromVersionId,
  stableId,
  toVersionId,
}: {
  fromVersionId: string;
  stableId: string;
  toVersionId: string;
}) {
  return `${stableId}\u0000${fromVersionId}\u0000${toVersionId}`;
}

function compareVersionsAscending(
  left: { effectiveDate: Date | null; id: string },
  right: { effectiveDate: Date | null; id: string },
) {
  const leftTime = left.effectiveDate?.getTime() ?? 0;
  const rightTime = right.effectiveDate?.getTime() ?? 0;
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return left.id.localeCompare(right.id);
}

function summarizeTextChange(before: string, after: string) {
  const beforeWords = normalizeForComparison(before).split(" ").filter(Boolean);
  const afterWords = normalizeForComparison(after).split(" ").filter(Boolean);
  let start = 0;
  while (
    start < beforeWords.length &&
    start < afterWords.length &&
    beforeWords[start] === afterWords[start]
  ) {
    start += 1;
  }

  let beforeEnd = beforeWords.length - 1;
  let afterEnd = afterWords.length - 1;
  while (
    beforeEnd >= start &&
    afterEnd >= start &&
    beforeWords[beforeEnd] === afterWords[afterEnd]
  ) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  return {
    before: excerptWords(beforeWords, start, beforeEnd),
    after: excerptWords(afterWords, start, afterEnd),
  };
}

function excerptWords(words: string[], start: number, end: number) {
  if (words.length === 0) {
    return "";
  }

  const safeStart = Math.max(0, Math.min(start, words.length - 1) - 8);
  const safeEnd = Math.min(words.length - 1, Math.max(end, start) + 8);
  const prefix = safeStart > 0 ? "..." : "";
  const suffix = safeEnd < words.length - 1 ? "..." : "";
  return `${prefix}${words.slice(safeStart, safeEnd + 1).join(" ")}${suffix}`;
}

function buildCommentBlocks(fragment: ReaderDbFragment): ReaderCommentBlock[] {
  return [
    {
      title: "Простыми словами",
      text: formatPlainExplanations(fragment.plainExplanations),
    },
    {
      title: "Комментарии экспертов",
      text: formatExpertComments(fragment.expertComments),
    },
    {
      title: "Ошибки и спорные места",
      text: formatIssues(fragment.issues),
    },
    {
      title: "Предложенная редакция",
      text: fragment.proposedRevisions[0]?.proposedText ?? "Пока не добавлено.",
    },
  ];
}

function getFragmentChangeStatus(
  fragment: ReaderDbFragment,
  currentFragment: ReaderDbFragment | null,
  isCurrentVersion: boolean,
): FragmentChangeStatus {
  if (isCurrentVersion) {
    return "current";
  }

  if (!currentFragment) {
    return "deleted";
  }

  return normalizeForComparison(fragment.text) === normalizeForComparison(currentFragment.text)
    ? "unchanged"
    : "changed";
}

function getCommentarySource(
  fragment: ReaderDbFragment,
  commentaryFragment: ReaderDbFragment,
  changeStatus: FragmentChangeStatus,
): CommentarySource {
  if (changeStatus === "unchanged" && commentaryFragment.id !== fragment.id) {
    return "current";
  }

  if (hasAnyCommentary(commentaryFragment)) {
    return "selected";
  }

  return "none";
}

function hasAnyCommentary(fragment: ReaderDbFragment) {
  return (
    fragment.plainExplanations.length > 0 ||
    fragment.expertComments.length > 0 ||
    fragment.issues.length > 0 ||
    fragment.proposedRevisions.length > 0
  );
}

function summarizeChanges(
  fragments: ReaderDbFragment[],
  currentFragmentsByStableId: Map<string, ReaderDbFragment>,
  versions: { currentVersionId: string | null; selectedVersionId: string | null },
) {
  if (!versions.currentVersionId || versions.selectedVersionId === versions.currentVersionId) {
    return {
      introduced: 0,
      unchanged: 0,
      changed: 0,
      deleted: 0,
    };
  }

  const selectedStableIds = new Set(fragments.map((fragment) => fragment.stableId));
  return fragments.reduce(
    (summary, fragment) => {
      const currentFragment = currentFragmentsByStableId.get(fragment.stableId) ?? null;
      const status = getFragmentChangeStatus(fragment, currentFragment, false);
      if (status === "unchanged" || status === "changed" || status === "deleted") {
        summary[status] += 1;
      }
      return summary;
    },
    {
      introduced: Array.from(currentFragmentsByStableId.keys()).filter(
        (stableId) => !selectedStableIds.has(stableId),
      ).length,
      unchanged: 0,
      changed: 0,
      deleted: 0,
    },
  );
}

function getParentIds(fragments: Array<{ parentId: string | null }>) {
  return new Set(
    fragments
      .map((fragment) => fragment.parentId)
      .filter((parentId): parentId is string => Boolean(parentId)),
  );
}

function formatVersionLabel(title: string, effectiveDate: Date | null) {
  const titleDate = title.match(/ред\.\s+от\s+([^)]+)/i)?.[1];
  const effective = effectiveDate ? `, действует с ${formatShortDate(effectiveDate)}` : "";
  return titleDate ? `Ред. от ${titleDate}${effective}` : `${title}${effective}`;
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function normalizeForComparison(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getHistoryChangeType(
  previousFragment: ReaderDbFragment | null,
  fragment: ReaderDbFragment | null,
): ReaderChangeHistoryEntry["status"] | null {
  if (previousFragment && fragment) {
    return normalizeForComparison(previousFragment.text) === normalizeForComparison(fragment.text)
      ? null
      : "changed";
  }

  if (fragment) {
    return "introduced";
  }

  if (previousFragment) {
    return "deleted";
  }

  return null;
}

function summarizeHistoryText(
  changeType: ReaderChangeHistoryEntry["status"],
  previousFragment: ReaderDbFragment | null,
  fragment: ReaderDbFragment | null,
) {
  if (changeType === "changed" && previousFragment && fragment) {
    return summarizeTextChange(previousFragment.text, fragment.text);
  }

  return {
    before: previousFragment ? excerptFullText(previousFragment.text) : null,
    after: fragment ? excerptFullText(fragment.text) : null,
  };
}

function excerptFullText(value: string) {
  const words = normalizeForComparison(value).split(" ").filter(Boolean);
  return excerptWords(words, 0, Math.min(words.length - 1, 40));
}

function defaultReason(changeType: ReaderChangeHistoryEntry["status"]) {
  const labels: Record<ReaderChangeHistoryEntry["status"], string> = {
    changed: "Пояснение причины изменения: пока не заполнено.",
    deleted: "Пояснение причины исключения: пока не заполнено.",
    introduced: "Пояснение причины введения: пока не заполнено.",
  };
  return labels[changeType];
}

function defaultPurpose(changeType: ReaderChangeHistoryEntry["status"]) {
  const labels: Record<ReaderChangeHistoryEntry["status"], string> = {
    changed: "Цель изменения: пока не заполнено.",
    deleted: "Цель исключения: пока не заполнено.",
    introduced: "Цель введения: пока не заполнено.",
  };
  return labels[changeType];
}

function defaultPracticalMeaning(changeType: ReaderChangeHistoryEntry["status"]) {
  const labels: Record<ReaderChangeHistoryEntry["status"], string> = {
    changed: "Практический смысл: пока не заполнено.",
    deleted: "Практический смысл исключения: пока не заполнено.",
    introduced: "Практический смысл введения: пока не заполнено.",
  };
  return labels[changeType];
}

function buildToc(
  fragments: Array<{ anchor: string; id: string; parentId: string | null; stableId: string; title: string | null; type: string }>,
  displayFragments: Array<{ anchor: string; parentId: string | null; stableId: string; title: string | null; type: string }>,
): ReaderTocItem[] {
  const stableIdsById = new Map(fragments.map((fragment) => [fragment.id, fragment.stableId]));
  const firstDisplayedByArticle = new Map<string, string>();
  for (const fragment of displayFragments) {
    const articleKey = getArticleKey(fragment.stableId);
    if (articleKey && !firstDisplayedByArticle.has(articleKey)) {
      firstDisplayedByArticle.set(articleKey, fragment.anchor);
    }
  }

  return fragments
    .filter((fragment) =>
      ["law", "article", "part", "point", "paragraph"].includes(fragment.type),
    )
    .map((fragment) => {
      const articleKey = getArticleKey(fragment.stableId);
      const id =
        fragment.type === "article" && articleKey
          ? (firstDisplayedByArticle.get(articleKey) ?? fragment.anchor)
          : fragment.anchor;
      return {
        id,
        stableId: fragment.stableId,
        parentStableId: fragment.parentId ? (stableIdsById.get(fragment.parentId) ?? null) : null,
        title: formatTocTitle(fragment.title, fragment.stableId, fragment.type),
        type: fragment.type,
      };
    });
}

function getArticleKey(stableId: string) {
  return stableId.match(/^(63fz\.article_\d+(?:_\d+)?)(?:\.|$)/)?.[1] ?? null;
}

function formatTocTitle(title: string | null, stableId: string, type: string) {
  const value = formatFragmentTitle(title, stableId);
  if (type === "part") {
    return value.replace(/^Статья\s+([\d.]+)\.\s+.+?,\s+часть\s+/i, "Ст. $1, ч. ");
  }

  return value;
}

function formatFragmentTitle(title: string | null, stableId: string) {
  return title?.trim() || stableId;
}

function formatPlainExplanations(explanations: Array<{ text: string }>) {
  if (explanations.length === 0) {
    return "Пояснение пока не добавлено.";
  }

  return explanations.map((explanation) => explanation.text).join("\n\n");
}

function formatExpertComments(
  comments: Array<{ expertName: string; expertTitle: string | null; text: string }>,
) {
  if (comments.length === 0) {
    return "Пока не добавлено.";
  }

  return comments
    .map((comment) => {
      const title = comment.expertTitle ? `, ${comment.expertTitle}` : "";
      return `${comment.expertName}${title}: ${comment.text}`;
    })
    .join("\n\n");
}

function formatIssues(
  issues: Array<{ severity: string; title: string; description: string }>,
) {
  if (issues.length === 0) {
    return "Пока не добавлено.";
  }

  return issues
    .map((issue) => `[${issue.severity}] ${issue.title}: ${issue.description}`)
    .join("\n\n");
}
