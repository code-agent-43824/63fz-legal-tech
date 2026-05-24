import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const law = await prisma.law.upsert({
    where: { slug: "63fz" },
    update: {
      title: "DEMO DATA: Федеральный закон 63-ФЗ «Об электронной подписи»",
      number: "63-ФЗ",
    },
    create: {
      slug: "63fz",
      title: "DEMO DATA: Федеральный закон 63-ФЗ «Об электронной подписи»",
      number: "63-ФЗ",
    },
  });

  const version = await prisma.lawVersion.upsert({
    where: { id: "demo-63fz-version" },
    update: {
      lawId: law.id,
      title: "DEMO DATA: учебная версия структуры закона",
      sourceUrl: "DEMO DATA: no official source imported yet",
      status: "published",
    },
    create: {
      id: "demo-63fz-version",
      lawId: law.id,
      title: "DEMO DATA: учебная версия структуры закона",
      sourceUrl: "DEMO DATA: no official source imported yet",
      status: "published",
    },
  });

  await prisma.law.update({
    where: { id: law.id },
    data: { currentVersionId: version.id },
  });

  const article = await prisma.lawFragment.upsert({
    where: {
      lawVersionId_stableId: {
        lawVersionId: version.id,
        stableId: "63fz.article_1",
      },
    },
    update: {
      text: "DEMO DATA: здесь будет официальный текст статьи после проверенного импорта.",
      order: 10,
    },
    create: {
      lawVersionId: version.id,
      stableId: "63fz.article_1",
      type: "article",
      number: "1",
      title: "DEMO DATA: Статья 1. Сфера действия",
      text: "DEMO DATA: здесь будет официальный текст статьи после проверенного импорта.",
      order: 10,
      anchor: "63fz.article_1",
    },
  });

  const part = await prisma.lawFragment.upsert({
    where: {
      lawVersionId_stableId: {
        lawVersionId: version.id,
        stableId: "63fz.article_1.part_1",
      },
    },
    update: {
      parentId: article.id,
      text: "DEMO DATA: пример части статьи для проверки иерархии.",
      order: 20,
    },
    create: {
      lawVersionId: version.id,
      stableId: "63fz.article_1.part_1",
      parentId: article.id,
      type: "part",
      number: "1",
      title: "DEMO DATA: Часть 1",
      text: "DEMO DATA: пример части статьи для проверки иерархии.",
      order: 20,
      anchor: "63fz.article_1.part_1",
    },
  });

  const paragraph = await prisma.lawFragment.upsert({
    where: {
      lawVersionId_stableId: {
        lawVersionId: version.id,
        stableId: "63fz.article_1.part_1.paragraph_1",
      },
    },
    update: {
      parentId: part.id,
      text: "DEMO DATA: пример абзаца, к которому можно привязать пояснение.",
      order: 30,
    },
    create: {
      lawVersionId: version.id,
      stableId: "63fz.article_1.part_1.paragraph_1",
      parentId: part.id,
      type: "paragraph",
      number: "1",
      title: "DEMO DATA: Абзац 1",
      text: "DEMO DATA: пример абзаца, к которому можно привязать пояснение.",
      order: 30,
      anchor: "63fz.article_1.part_1.paragraph_1",
    },
  });

  await prisma.plainExplanation.upsert({
    where: { id: "demo-explanation-paragraph-1" },
    update: {
      fragmentId: paragraph.id,
      text: "DEMO DATA: простое объяснение будет добавляться отдельно от оригинального текста закона.",
      status: "published",
      authorName: "DEMO DATA",
    },
    create: {
      id: "demo-explanation-paragraph-1",
      fragmentId: paragraph.id,
      text: "DEMO DATA: простое объяснение будет добавляться отдельно от оригинального текста закона.",
      status: "published",
      authorName: "DEMO DATA",
    },
  });

  await prisma.expertComment.upsert({
    where: { id: "demo-expert-comment-paragraph-1" },
    update: {
      fragmentId: paragraph.id,
      expertName: "DEMO DATA",
      expertTitle: "Не реальный экспертный комментарий",
      text: "DEMO DATA: здесь будет экспертный комментарий после ручного заполнения.",
      status: "published",
    },
    create: {
      id: "demo-expert-comment-paragraph-1",
      fragmentId: paragraph.id,
      expertName: "DEMO DATA",
      expertTitle: "Не реальный экспертный комментарий",
      text: "DEMO DATA: здесь будет экспертный комментарий после ручного заполнения.",
      status: "published",
    },
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
