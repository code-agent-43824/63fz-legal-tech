import { prisma } from "@/lib/prisma";

export type ReaderCommentBlock = {
  title: string;
  text: string;
};

export type ReaderFragment = {
  id: string;
  title: string;
  text: string;
  blocks: ReaderCommentBlock[];
};

export type ReaderData = {
  isDemo: boolean;
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

  return {
    isDemo: law?.title.includes("DEMO DATA") ?? false,
    fragments: fragments.map((fragment) => ({
      id: fragment.anchor,
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
    fragments: [
      {
        id: "63fz.article_1",
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
