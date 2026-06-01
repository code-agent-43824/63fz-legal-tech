import { prisma } from "@/lib/prisma";

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
  blocks: ReaderCommentBlock[];
};

export type ReaderTocItem = {
  id: string;
  stableId: string;
  parentStableId: string | null;
  title: string;
  type: string;
};

export type ReaderData = {
  isDemo: boolean;
  toc: ReaderTocItem[];
  fragments: ReaderFragment[];
};

export async function getReaderData(): Promise<ReaderData> {
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
            include: {
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
            },
          },
        },
      },
    },
  });

  const fragments = law?.currentVersion?.fragments ?? [];

  if (fragments.length === 0) {
    return getDemoReaderData();
  }

  const parentIds = new Set(
    fragments
      .map((fragment) => fragment.parentId)
      .filter((parentId): parentId is string => Boolean(parentId)),
  );
  const stableIdsById = new Map(fragments.map((fragment) => [fragment.id, fragment.stableId]));
  const displayFragments = fragments.filter((fragment) => {
    if (!fragment.text.trim()) {
      return false;
    }

    return fragment.type !== "article" || !parentIds.has(fragment.id);
  });

  return {
    isDemo: law?.title.includes("DEMO DATA") ?? false,
    toc: buildToc(fragments, displayFragments),
    fragments: displayFragments.map((fragment) => ({
      id: fragment.anchor,
      stableId: fragment.stableId,
      parentStableId: fragment.parentId ? (stableIdsById.get(fragment.parentId) ?? null) : null,
      type: fragment.type,
      title: formatFragmentTitle(fragment.title, fragment.stableId),
      text: fragment.text,
      blocks: [
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
      ],
    })),
  };
}

function getDemoReaderData(): ReaderData {
  return {
    isDemo: true,
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
        blocks: [
          { title: "Простыми словами", text: "Комментариев экспертов пока нет." },
          { title: "Комментарии экспертов", text: "Пока не добавлено." },
          { title: "Ошибки и спорные места", text: "Пока не добавлено." },
          { title: "Предложенная редакция", text: "Пока не добавлено." },
        ],
      },
    ],
  };
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
