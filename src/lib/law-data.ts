import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type FragmentChangeStatus = "current" | "unchanged" | "changed" | "deleted";
type CommentarySource = "selected" | "current" | "none";

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

  if (fragments.length === 0) {
    return getDemoReaderData();
  }

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
        blocks: [
          { title: "Простыми словами", text: "Комментариев экспертов пока нет." },
          { title: "Комментарии экспертов", text: "Пока не добавлено." },
          { title: "Ошибки и спорные места", text: "Пока не добавлено." },
          { title: "Предложенная редакция", text: "Пока не добавлено." },
        ],
      },
    ],
    changeSummary: {
      unchanged: 0,
      changed: 0,
      deleted: 0,
    },
  };
}

function mapReaderFragment({
  currentFragment,
  currentVersionId,
  fragment,
  selectedVersionId,
  stableIdsById,
}: {
  currentFragment: ReaderDbFragment | null;
  currentVersionId: string | null;
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
    blocks: buildCommentBlocks(commentaryFragment),
  };
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
      unchanged: 0,
      changed: 0,
      deleted: 0,
    };
  }

  return fragments.reduce(
    (summary, fragment) => {
      const currentFragment = currentFragmentsByStableId.get(fragment.stableId) ?? null;
      const status = getFragmentChangeStatus(fragment, currentFragment, false);
      if (status === "unchanged" || status === "changed" || status === "deleted") {
        summary[status] += 1;
      }
      return summary;
    },
    { unchanged: 0, changed: 0, deleted: 0 },
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
