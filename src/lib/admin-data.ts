import { prisma } from "@/lib/prisma";

export type AdminFragmentListItem = {
  id: string;
  stableId: string;
  title: string;
  type: string;
  anchor: string;
  explanationCount: number;
  expertCommentCount: number;
  issueCount: number;
  proposedRevisionCount: number;
};

export async function getAdminFragments(): Promise<AdminFragmentListItem[]> {
  if (!process.env.DATABASE_URL) {
    return [
      {
        id: "demo-fragment-1",
        stableId: "63fz.article_1",
        title: "DEMO DATA: Статья 1. Сфера действия",
        type: "article",
        anchor: "63fz.article_1",
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
    title: fragment.title ?? fragment.stableId,
    type: fragment.type,
    anchor: fragment.anchor,
    explanationCount: fragment._count.plainExplanations,
    expertCommentCount: fragment._count.expertComments,
    issueCount: fragment._count.issues,
    proposedRevisionCount: fragment._count.proposedRevisions,
  }));
}
