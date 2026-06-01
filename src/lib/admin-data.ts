import { prisma } from "@/lib/prisma";

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
