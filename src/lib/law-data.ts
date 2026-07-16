import { Prisma } from "@prisma/client";
import { getTransitionChangeType, normalizeForComparison } from "@/lib/change-history";
import {
  compareLawVersionsChronologically,
  lawVersionOrderByAscending,
  lawVersionOrderByDescending,
} from "@/lib/law-version-order";
import { PUBLIC_LAW_SLUG, PUBLIC_VERSION_STATUSES } from "@/lib/law-scope";
import { PUBLIC_READER_STATUSES } from "@/lib/publication-policy";
import { prisma } from "@/lib/prisma";
import {
  BoundedMemoryCache,
  getPublicReaderCacheMarker,
} from "@/lib/reader-cache";
import {
  makeSafeSourceLink,
  parseSafeSourceLinks,
  type SafeSourceLink,
} from "@/lib/source-links";
import {
  buildFullTextSnippet,
  buildTextDiffSummary,
  type DiffSegment,
} from "@/lib/text-diff";

type FragmentChangeStatus = "current" | "unchanged" | "changed" | "deleted";
type CommentarySource = "selected" | "current" | "none";

export type ReaderChangeHistoryEntry = {
  changeId: string;
  status: "introduced" | "changed" | "deleted";
  stableId: string;
  fromVersionId: string;
  toVersionId: string;
  versionId: string;
  versionLabel: string;
  previousVersionLabel: string | null;
  beforeSnippet: string | null;
  afterSnippet: string | null;
  beforeSegments: DiffSegment[];
  afterSegments: DiffSegment[];
  hasPublishedExplanation: boolean;
  reason: string;
  purpose: string;
  practicalMeaning: string;
  sourceLinks: SafeSourceLink[];
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
  sourceLink: SafeSourceLink | null;
  sourceName: string | null;
  sourceRetrievedAt: string | null;
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
  expertComments: Array<{ expertName: string; expertTitle: string | null; text: string; kind: string; origin: string }>;
  id: string;
  issues: Array<{ severity: string; title: string; description: string }>;
  parentId: string | null;
  plainExplanations: Array<{ authorName: string | null; text: string; origin: string }>;
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

type ReaderHistoryFragment = {
  stableId: string;
  text: string;
  title: string | null;
  type: string;
};

type ReaderTextFragment = {
  text: string;
};

type ReaderCacheEntry = {
  data: ReaderData;
  marker: number;
};

type ReaderVersionRecord = {
  createdAt: Date;
  effectiveDate: Date | null;
  id: string;
  sourceName: string | null;
  sourceRetrievedAt: Date | null;
  sourceUrl: string | null;
  status: string;
  title: string;
};

type ReaderLawRecord = {
  currentVersion: ReaderVersionRecord | null;
  id: string;
  title: string;
  versions: ReaderVersionRecord[];
};

const readerDataCache = new BoundedMemoryCache<ReaderCacheEntry>();
let lastReaderCacheMarker: number | null = null;

const fragmentInclude = Prisma.validator<Prisma.LawFragmentInclude>()({
  plainExplanations: {
    where: { status: PUBLIC_READER_STATUSES.plainExplanation },
    orderBy: { updatedAt: "desc" },
  },
  expertComments: {
    where: { status: PUBLIC_READER_STATUSES.expertComment },
    orderBy: { updatedAt: "desc" },
  },
  issues: {
    where: { status: PUBLIC_READER_STATUSES.issue },
    orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
  },
  proposedRevisions: {
    where: { status: PUBLIC_READER_STATUSES.proposedRevision },
    orderBy: { updatedAt: "desc" },
  },
});

export async function getReaderData(requestedVersionId?: string): Promise<ReaderData> {
  if (!process.env.DATABASE_URL) {
    return getDemoReaderData();
  }

  const marker = await getPublicReaderCacheMarker();
  if (lastReaderCacheMarker !== null && lastReaderCacheMarker !== marker) {
    readerDataCache.clear();
  }
  lastReaderCacheMarker = marker;

  const selection = await getReaderVersionSelection(requestedVersionId);
  if (!selection) {
    return getDemoReaderData();
  }

  const cacheKey = selection.selectedVersion.id;
  const cached = readerDataCache.get(cacheKey);
  if (cached?.marker === marker) {
    return cached.data;
  }

  try {
    const data = await getReaderDataFromDatabase(selection);
    readerDataCache.set(cacheKey, { data, marker });
    return data;
  } catch (error) {
    const fallback = getSafeReaderDataCacheFallback({
      cacheKey,
      cached,
      marker,
    });
    if (fallback) {
      return fallback;
    }

    throw error;
  }
}

export function clearReaderDataMemoryCache() {
  readerDataCache.clear();
  lastReaderCacheMarker = null;
}

export function getReaderDataMemoryCacheState() {
  return readerDataCache.state();
}

export function getSafeReaderDataCacheFallback({
  cacheKey,
  cached,
  marker,
}: {
  cacheKey: string | null;
  cached: ReaderCacheEntry | undefined;
  marker: number;
}) {
  if (!cacheKey || cached?.marker !== marker) {
    return null;
  }

  return cached.data;
}

async function getReaderVersionSelection(requestedVersionId?: string) {
  const law = await prisma.law.findUnique({
    where: { slug: PUBLIC_LAW_SLUG },
    select: {
      id: true,
      title: true,
      currentVersion: {
        select: readerVersionSelect,
      },
      versions: {
        where: { status: { in: [...PUBLIC_VERSION_STATUSES] } },
        orderBy: lawVersionOrderByDescending,
        select: readerVersionSelect,
      },
    },
  });

  const currentVersion = law?.currentVersion ?? null;
  const versions = (law?.versions ?? []).filter((version) => !isDemoVersion(version.title));
  const selectedVersionId = resolveReaderVersionCacheKey({
    currentVersionId: currentVersion?.id ?? null,
    requestedVersionId,
    versionIds: versions.map((version) => version.id),
  });
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? null;

  if (!law || !selectedVersion) {
    return null;
  }

  return { law, versions, currentVersion, selectedVersion };
}

export function resolveReaderVersionCacheKey({
  currentVersionId,
  requestedVersionId,
  versionIds,
}: {
  currentVersionId: string | null;
  requestedVersionId?: string;
  versionIds: string[];
}) {
  if (requestedVersionId && versionIds.includes(requestedVersionId)) {
    return requestedVersionId;
  }

  if (currentVersionId && versionIds.includes(currentVersionId)) {
    return currentVersionId;
  }

  return versionIds[0] ?? null;
}

async function getReaderDataFromDatabase({
  currentVersion,
  law,
  selectedVersion,
  versions,
}: {
  currentVersion: ReaderVersionRecord | null;
  law: ReaderLawRecord;
  selectedVersion: ReaderVersionRecord;
  versions: ReaderVersionRecord[];
}): Promise<ReaderData> {
  const fragments = await prisma.lawFragment.findMany({
    where: { lawVersionId: selectedVersion.id },
    orderBy: { order: "asc" },
    include: fragmentInclude,
  });

  if (fragments.length === 0) {
    return getDemoReaderData();
  }

  const currentFragments =
    currentVersion && currentVersion.id !== selectedVersion.id
      ? await prisma.lawFragment.findMany({
          where: { lawVersionId: currentVersion.id },
          orderBy: { order: "asc" },
          include: fragmentInclude,
        })
      : fragments;
  const parentIds = getParentIds(fragments);
  const stableIdsById = new Map(fragments.map((fragment) => [fragment.id, fragment.stableId]));
  const currentFragmentsByStableId = new Map(
    currentFragments.map((fragment) => [fragment.stableId, fragment]),
  );
  const displayFragments = fragments.filter((fragment) => {
    if (!fragment.text.trim()) {
      return false;
    }

    return fragment.type !== "article" || !parentIds.has(fragment.id);
  });
  const displayStableIds = displayFragments.map((fragment) => fragment.stableId);
  const [historyVersions, changeExplanations] = await Promise.all([
    prisma.lawVersion.findMany({
      where: {
        id: { in: versions.map((version) => version.id) },
      },
      orderBy: lawVersionOrderByAscending,
      select: {
        createdAt: true,
        effectiveDate: true,
        id: true,
        title: true,
        fragments: {
          where: { stableId: { in: displayStableIds } },
          orderBy: { order: "asc" },
          select: {
            stableId: true,
            text: true,
            title: true,
            type: true,
          },
        },
      },
    }),
    prisma.fragmentChangeExplanation.findMany({
      where: {
        status: PUBLIC_READER_STATUSES.changeExplanation,
        stableId: { in: displayStableIds },
        fromVersion: { lawId: law.id },
        toVersion: { lawId: law.id },
      },
    }),
  ]);
  const changeHistoriesByStableId = buildChangeHistoriesByStableId(
    historyVersions,
    changeExplanations,
  );

  return {
    isDemo: law?.title.includes("DEMO DATA") ?? false,
    versions: versions.map((version) => ({
      id: version.id,
      title: version.title,
      label: formatVersionLabel(version.title, version.effectiveDate),
      effectiveDate: version.effectiveDate?.toISOString() ?? null,
      sourceLink: makeSafeSourceLink(version.sourceUrl, version.sourceName),
      sourceName: version.sourceName ?? null,
      sourceRetrievedAt: version.sourceRetrievedAt?.toISOString() ?? null,
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

const readerVersionSelect = Prisma.validator<Prisma.LawVersionSelect>()({
  createdAt: true,
  effectiveDate: true,
  id: true,
  sourceName: true,
  sourceRetrievedAt: true,
  sourceUrl: true,
  status: true,
  title: true,
});

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
        blocks: [],
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
        blocks: [],
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
    createdAt: Date;
    effectiveDate: Date | null;
    fragments: ReaderHistoryFragment[];
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
      const changeType = getTransitionChangeType(previousFragment, fragment);
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
        changeId: encodeChangeId({
          fromVersionId: previousVersion.id,
          stableId,
          toVersionId: version.id,
        }),
        status: changeType,
        stableId,
        fromVersionId: previousVersion.id,
        toVersionId: version.id,
        versionId: version.id,
        versionLabel,
        previousVersionLabel,
        beforeSnippet: snippets.before,
        afterSnippet: snippets.after,
        beforeSegments: snippets.beforeSegments,
        afterSegments: snippets.afterSegments,
        hasPublishedExplanation: Boolean(explanation),
        reason: explanation?.reason?.trim() || defaultReason(changeType),
        purpose: explanation?.purpose?.trim() || defaultPurpose(changeType),
        practicalMeaning: explanation?.practicalMeaning?.trim() || defaultPracticalMeaning(changeType),
        sourceLinks: parseSafeSourceLinks(explanation?.sourceLinks),
      });
      histories.set(stableId, entries);
    }
  }

  return histories;
}

export function encodeChangeId({
  fromVersionId,
  stableId,
  toVersionId,
}: {
  fromVersionId: string;
  stableId: string;
  toVersionId: string;
}) {
  return `${encodeURIComponent(stableId)}..${encodeURIComponent(fromVersionId)}..${encodeURIComponent(toVersionId)}`;
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

const compareVersionsAscending = compareLawVersionsChronologically;

function buildCommentBlocks(fragment: ReaderDbFragment): ReaderCommentBlock[] {
  const blocks: ReaderCommentBlock[] = [];

  if (fragment.plainExplanations.length > 0) {
    blocks.push({
      title: "Простыми словами",
      text: formatPlainExplanations(fragment.plainExplanations),
    });
  }

  const expertComments = fragment.expertComments.filter((item) => item.kind === "comment");
  const recommendations = fragment.expertComments.filter((item) => item.kind === "recommendation");
  if (expertComments.length > 0) {
    blocks.push({
      title: "Комментарии экспертов",
      text: formatExpertComments(expertComments),
    });
  }
  if (recommendations.length > 0) blocks.push({ title: "Практические рекомендации", text: formatExpertComments(recommendations) });

  if (fragment.issues.length > 0) {
    blocks.push({
      title: "Ошибки и спорные места",
      text: formatIssues(fragment.issues),
    });
  }

  const proposedRevision = fragment.proposedRevisions[0];
  if (proposedRevision) {
    blocks.push({
      title: "Предложенная редакция",
      text: proposedRevision.proposedText,
    });
  }

  return blocks;
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

function summarizeHistoryText(
  changeType: ReaderChangeHistoryEntry["status"],
  previousFragment: ReaderTextFragment | null,
  fragment: ReaderTextFragment | null,
) {
  if (changeType === "changed" && previousFragment && fragment) {
    const diff = buildTextDiffSummary(previousFragment.text, fragment.text);
    return {
      before: diff.beforeSnippet,
      after: diff.afterSnippet,
      beforeSegments: diff.beforeSegments,
      afterSegments: diff.afterSegments,
    };
  }

  return {
    before: previousFragment ? buildFullTextSnippet(previousFragment.text) : null,
    after: fragment ? buildFullTextSnippet(fragment.text) : null,
    beforeSegments: [],
    afterSegments: [],
  };
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

function formatPlainExplanations(explanations: Array<{ authorName: string | null; text: string; origin: string }>) {
  if (explanations.length === 0) {
    return "Пояснение пока не добавлено.";
  }

  return explanations
    .map((explanation) => `${explanation.authorName ? `${explanation.authorName}: ` : ""}${explanation.text}${explanation.origin === "ai_assisted" ? "\n(ИИ использован при подготовке; материал проверен и опубликован экспертом.)" : ""}`)
    .join("\n\n");
}

function formatExpertComments(
  comments: Array<{ expertName: string; expertTitle: string | null; text: string; origin: string }>,
) {
  if (comments.length === 0) {
    return "Пока не добавлено.";
  }

  return comments
    .map((comment) => {
      const title = comment.expertTitle ? `, ${comment.expertTitle}` : "";
      return `${comment.expertName}${title}: ${comment.text}${comment.origin === "ai_assisted" ? "\n(ИИ использован при подготовке; материал проверен и опубликован экспертом.)" : ""}`;
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
