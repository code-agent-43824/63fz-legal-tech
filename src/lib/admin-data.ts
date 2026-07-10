import { prisma } from "@/lib/prisma";
import {
  getTransitionChangeType,
  normalizeForComparison,
  type TransitionChangeType,
} from "@/lib/change-history";

export type AdminFragmentListItem = {
  id: string;
  stableId: string;
  parentId: string | null;
  title: string;
  type: string;
  number: string | null;
  anchor: string;
  text: string;
  explanationCount: number;
  expertCommentCount: number;
  issueCount: number;
  proposedRevisionCount: number;
};

export type AdminFragmentDetails = AdminFragmentListItem & {
  originalText: string;
  plainExplanations: Array<{
    id: string;
    text: string;
    status: string;
    authorName: string | null;
  }>;
  expertComments: Array<{
    id: string;
    expertName: string;
    expertTitle: string | null;
    text: string;
    status: string;
  }>;
  issues: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    severity: string;
    status: string;
  }>;
  proposedRevisions: Array<{
    id: string;
    originalText: string;
    proposedText: string;
    rationale: string;
    status: string;
  }>;
};

export type AdminChangeTransition = {
  changeType: TransitionChangeType;
  stableId: string;
  title: string;
  type: string;
  fromVersionId: string;
  fromVersionLabel: string;
  toVersionId: string;
  toVersionLabel: string;
  beforeSnippet: string;
  afterSnippet: string;
  explanation: {
    id: string;
    reason: string | null;
    purpose: string | null;
    practicalMeaning: string | null;
    sourceLinks: string | null;
    status: string;
  } | null;
};

export type AdminChangeFilters = {
  article?: string;
  q?: string;
  status?: string;
};

export async function getAdminFragments(): Promise<AdminFragmentListItem[]> {
  if (!process.env.DATABASE_URL) {
    return [
      {
        id: "demo-fragment-1",
        stableId: "63fz.article_1",
        parentId: null,
        title: "DEMO DATA: Статья 1. Сфера действия",
        type: "article",
        number: "1",
        anchor: "63fz.article_1",
        text: "DEMO DATA: база не подключена.",
        explanationCount: 0,
        expertCommentCount: 0,
        issueCount: 0,
        proposedRevisionCount: 0,
      },
    ];
  }

  const law = await prisma.law.findUnique({
    where: { slug: "63fz" },
    include: { currentVersion: true },
  });

  if (!law?.currentVersionId) {
    return [];
  }

  const fragments = await prisma.lawFragment.findMany({
    where: { lawVersionId: law.currentVersionId },
    orderBy: { order: "asc" },
    include: {
      _count: {
        select: {
          plainExplanations: true,
          expertComments: true,
          issues: true,
          proposedRevisions: true,
        },
      },
    },
  });

  return fragments.map((fragment) => ({
    id: fragment.id,
    stableId: fragment.stableId,
    parentId: fragment.parentId,
    title: fragment.title ?? fragment.stableId,
    type: fragment.type,
    number: fragment.number,
    anchor: fragment.anchor,
    text: fragment.text,
    explanationCount: fragment._count.plainExplanations,
    expertCommentCount: fragment._count.expertComments,
    issueCount: fragment._count.issues,
    proposedRevisionCount: fragment._count.proposedRevisions,
  }));
}

export async function getAdminFragmentDetails(
  fragmentId: string,
): Promise<AdminFragmentDetails | null> {
  if (!process.env.DATABASE_URL) {
    if (fragmentId !== "demo-fragment-1") {
      return null;
    }

    return {
      id: "demo-fragment-1",
      stableId: "63fz.article_1",
      parentId: null,
      title: "DEMO DATA: Статья 1. Сфера действия",
      type: "article",
      number: "1",
      anchor: "63fz.article_1",
      text: "DEMO DATA: база не подключена.",
      originalText: "DEMO DATA: база не подключена, поэтому это read-only fallback.",
      explanationCount: 0,
      expertCommentCount: 0,
      issueCount: 0,
      proposedRevisionCount: 0,
      plainExplanations: [],
      expertComments: [],
      issues: [],
      proposedRevisions: [],
    };
  }

  const fragment = await prisma.lawFragment.findUnique({
    where: { id: fragmentId },
    include: {
      plainExplanations: { orderBy: { updatedAt: "desc" } },
      expertComments: { orderBy: { updatedAt: "desc" } },
      issues: { orderBy: { updatedAt: "desc" } },
      proposedRevisions: { orderBy: { updatedAt: "desc" } },
      _count: {
        select: {
          plainExplanations: true,
          expertComments: true,
          issues: true,
          proposedRevisions: true,
        },
      },
    },
  });

  if (!fragment) {
    return null;
  }

  return {
    id: fragment.id,
    stableId: fragment.stableId,
    parentId: fragment.parentId,
    title: fragment.title ?? fragment.stableId,
    type: fragment.type,
    number: fragment.number,
    anchor: fragment.anchor,
    text: fragment.text,
    originalText: fragment.text,
    explanationCount: fragment._count.plainExplanations,
    expertCommentCount: fragment._count.expertComments,
    issueCount: fragment._count.issues,
    proposedRevisionCount: fragment._count.proposedRevisions,
    plainExplanations: fragment.plainExplanations,
    expertComments: fragment.expertComments,
    issues: fragment.issues,
    proposedRevisions: fragment.proposedRevisions,
  };
}

export async function getAdminChangeTransitions(
  filters: AdminChangeFilters = {},
): Promise<AdminChangeTransition[]> {
  if (!process.env.DATABASE_URL) {
    return [];
  }

  const law = await prisma.law.findUnique({
    where: { slug: "63fz" },
    include: {
      versions: {
        where: { status: { in: ["published", "archived"] } },
        orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
        include: {
          fragments: {
            orderBy: { order: "asc" },
            select: {
              stableId: true,
              text: true,
              title: true,
              type: true,
              order: true,
            },
          },
        },
      },
    },
  });

  if (!law) {
    return [];
  }

  const versions = law.versions.filter((version) => !isDemoVersion(version.title));
  const explanations = await prisma.fragmentChangeExplanation.findMany({
    where: {
      fromVersion: { lawId: law.id },
      toVersion: { lawId: law.id },
    },
  });
  const explanationsByTransition = new Map(
    explanations.map((explanation) => [transitionKey(explanation), explanation]),
  );
  const transitions: AdminChangeTransition[] = [];

  for (let index = 1; index < versions.length; index += 1) {
    const previousVersion = versions[index - 1];
    const version = versions[index];
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

      const explanation = explanationsByTransition.get(
        transitionKey({
          fromVersionId: previousVersion.id,
          stableId,
          toVersionId: version.id,
        }),
      );
      const snippets = summarizeTransitionText(changeType, previousFragment, fragment);
      transitions.push({
        changeType,
        stableId,
        title: fragment?.title ?? previousFragment?.title ?? stableId,
        type: fragment?.type ?? previousFragment?.type ?? "fragment",
        fromVersionId: previousVersion.id,
        fromVersionLabel: previousVersionLabel,
        toVersionId: version.id,
        toVersionLabel: versionLabel,
        beforeSnippet: snippets.before,
        afterSnippet: snippets.after,
        explanation: explanation
          ? {
              id: explanation.id,
              reason: explanation.reason,
              purpose: explanation.purpose,
              practicalMeaning: explanation.practicalMeaning,
              sourceLinks: explanation.sourceLinks,
              status: explanation.status,
            }
          : null,
      });
    }
  }

  return filterChangeTransitions(removeAggregateArticleDuplicates(transitions), filters);
}

function filterChangeTransitions(
  transitions: AdminChangeTransition[],
  filters: AdminChangeFilters,
) {
  const article = filters.article?.trim();
  const query = filters.q?.trim().toLowerCase();
  const status = filters.status?.trim();

  return transitions.filter((transition) => {
    if (article && getArticleNumber(transition.stableId) !== article) {
      return false;
    }

    if (status === "missing" && transition.explanation) {
      return false;
    }

    if (
      (status === "draft" || status === "published") &&
      transition.explanation?.status !== status
    ) {
      return false;
    }

    if (query) {
      const haystack = [
        transition.stableId,
        transition.title,
        transition.beforeSnippet,
        transition.afterSnippet,
        transition.explanation?.reason,
        transition.explanation?.purpose,
        transition.explanation?.practicalMeaning,
        transition.explanation?.sourceLinks,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }

    return true;
  });
}

function isDemoVersion(title: string) {
  return title.toUpperCase().includes("DEMO DATA");
}

function getArticleNumber(stableId: string) {
  const match = stableId.match(/^63fz\.article_(\d+(?:_\d+)?)(?:\.|$)/);
  return match?.[1].replace("_", ".") ?? null;
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

function removeAggregateArticleDuplicates(transitions: AdminChangeTransition[]) {
  return transitions.filter((transition) => {
    if (transition.type !== "article") {
      return true;
    }

    const descendantPrefix = `${transition.stableId}.`;
    return !transitions.some(
      (candidate) =>
        candidate.fromVersionId === transition.fromVersionId &&
        candidate.toVersionId === transition.toVersionId &&
        candidate.stableId.startsWith(descendantPrefix),
    );
  });
}

function summarizeTransitionText(
  changeType: AdminChangeTransition["changeType"],
  previousFragment: { text: string } | null,
  fragment: { text: string } | null,
) {
  if (changeType === "changed" && previousFragment && fragment) {
    return summarizeTextChange(previousFragment.text, fragment.text);
  }

  return {
    before: previousFragment ? excerptFullText(previousFragment.text) : "",
    after: fragment ? excerptFullText(fragment.text) : "",
  };
}

function excerptFullText(value: string) {
  const words = normalizeForComparison(value).split(" ").filter(Boolean);
  return excerptWords(words, 0, Math.min(words.length - 1, 40));
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
