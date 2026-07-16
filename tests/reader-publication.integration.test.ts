import assert from "node:assert/strict";
import test from "node:test";

// Opt-in integration test: point INTEGRATION_DATABASE_URL to a DISPOSABLE
// database with applied migrations (prisma migrate deploy). The test deletes
// and recreates the public `63fz` law, so never run it against a real database.
const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;

const PUBLISHED_EXPLANATION = "Опубликованное пояснение простыми словами.";
const PUBLISHED_ISSUE_TITLE = "Подтверждённая проблема нормы";
const ACCEPTED_REVISION = "Принятая предлагаемая формулировка.";
const PUBLISHED_CHANGE_REASON = "Опубликованная причина изменения статьи 1.";
const PUBLISHED_EXPERT_NAME = "Ирина Экспертова";
const PRIVATE_PASSWORD_HASH = "PRIVATE_PASSWORD_HASH_MUST_NOT_LEAK";
const PUBLISHED_RECOMMENDATION = "Проверенная практическая рекомендация.";

const DRAFT_MARKERS = [
  "ЧЕРНОВОЕ ПОЯСНЕНИЕ не должно попадать в публичный вывод",
  "ЧЕРНОВОЙ ЭКСПЕРТНЫЙ КОММЕНТАРИЙ",
  "ГИПОТЕЗА О ПРОБЛЕМЕ",
  "ЧЕРНОВАЯ ФОРМУЛИРОВКА",
  "ЧЕРНОВАЯ ПРИЧИНА ИЗМЕНЕНИЯ",
  "ЧЕРНОВАЯ РЕДАКЦИЯ ЗАКОНА",
  "ИИ-МАТЕРИАЛ НА ПРОВЕРКЕ",
  "СНЯТЫЙ С ПУБЛИКАЦИИ МАТЕРИАЛ",
];

test(
  "integration: public reader exposes only published versions and editorial content",
  {
    skip: integrationDatabaseUrl
      ? false
      : "set INTEGRATION_DATABASE_URL to a disposable migrated database to run",
  },
  async () => {
    process.env.DATABASE_URL = integrationDatabaseUrl;
    const { PrismaClient } = await import("@prisma/client");
    const { PUBLIC_LAW_SLUG } = await import("../src/lib/law-scope");
    const lawData = await import("../src/lib/law-data");
    const prisma = new PrismaClient();

    async function resetLaw() {
      await prisma.law.deleteMany({ where: { slug: PUBLIC_LAW_SLUG } });
      await prisma.editorialUser.deleteMany({});
    }

    async function createVersionFragments({
      articleText,
      lawVersionId,
      withSecondArticle,
    }: {
      articleText: string;
      lawVersionId: string;
      withSecondArticle: boolean;
    }) {
      const root = await prisma.lawFragment.create({
        data: {
          lawVersionId,
          stableId: "63fz.document",
          type: "law",
          number: "63-ФЗ",
          title: "Федеральный закон 63-ФЗ",
          text: "Преамбула закона.",
          order: 0,
          anchor: "63fz.document",
        },
      });
      const article1 = await prisma.lawFragment.create({
        data: {
          lawVersionId,
          parentId: root.id,
          stableId: "63fz.article_1",
          type: "article",
          number: "1",
          title: "Статья 1. Сфера действия",
          text: articleText,
          order: 1000,
          anchor: "63fz.article_1",
        },
      });
      if (withSecondArticle) {
        await prisma.lawFragment.create({
          data: {
            lawVersionId,
            parentId: root.id,
            stableId: "63fz.article_2",
            type: "article",
            number: "2",
            title: "Статья 2. Новая статья",
            text: "Текст новой статьи 2.",
            order: 2000,
            anchor: "63fz.article_2",
          },
        });
      }
      return article1;
    }

    try {
      await resetLaw();

      const law = await prisma.law.create({
        data: {
          slug: PUBLIC_LAW_SLUG,
          title: "Федеральный закон 63-ФЗ (интеграционный тест)",
          number: "63-ФЗ",
        },
      });
      const versionV1 = await prisma.lawVersion.create({
        data: {
          lawId: law.id,
          title: "Редакция от 01.01.2020",
          status: "published",
          effectiveDate: new Date("2020-01-01T00:00:00Z"),
        },
      });
      const versionV2 = await prisma.lawVersion.create({
        data: {
          lawId: law.id,
          title: "Редакция от 01.01.2021",
          status: "published",
          effectiveDate: new Date("2021-01-01T00:00:00Z"),
        },
      });
      const versionDraft = await prisma.lawVersion.create({
        data: {
          lawId: law.id,
          title: "Редакция от 01.01.2022",
          status: "draft",
          effectiveDate: new Date("2022-01-01T00:00:00Z"),
        },
      });
      await prisma.law.update({
        where: { id: law.id },
        data: { currentVersionId: versionV2.id },
      });

      await createVersionFragments({
        articleText: "Старый текст статьи 1.",
        lawVersionId: versionV1.id,
        withSecondArticle: false,
      });
      const articleV2 = await createVersionFragments({
        articleText: "Новый текст статьи 1.",
        lawVersionId: versionV2.id,
        withSecondArticle: true,
      });
      const expert = await prisma.editorialUser.create({
        data: {
          username: "integration.expert",
          displayName: PUBLISHED_EXPERT_NAME,
          professionalTitle: "Юрист по электронной подписи",
          passwordHash: PRIVATE_PASSWORD_HASH,
          role: "expert",
        },
      });
      await createVersionFragments({
        articleText: `${DRAFT_MARKERS[5]}: будущий текст статьи 1.`,
        lawVersionId: versionDraft.id,
        withSecondArticle: true,
      });

      await prisma.plainExplanation.createMany({
        data: [
          { fragmentId: articleV2.id, text: PUBLISHED_EXPLANATION, status: "published", authorId: expert.id, authorName: expert.displayName },
          { fragmentId: articleV2.id, text: DRAFT_MARKERS[0], status: "draft" },
        ],
      });
      await prisma.expertComment.create({
        data: {
          fragmentId: articleV2.id,
          expertName: "Эксперт",
          text: DRAFT_MARKERS[1],
          status: "draft",
        },
      });
      await prisma.expertComment.createMany({data:[
        {fragmentId:articleV2.id,expertName:expert.displayName,authorId:expert.id,text:DRAFT_MARKERS[6],status:"in_review",origin:"ai_assisted"},
        {fragmentId:articleV2.id,expertName:expert.displayName,authorId:expert.id,text:DRAFT_MARKERS[7],status:"unpublished",origin:"human"},
        {fragmentId:articleV2.id,expertName:expert.displayName,authorId:expert.id,text:PUBLISHED_RECOMMENDATION,status:"published",kind:"recommendation",origin:"ai_assisted",reviewedAt:new Date(),reviewedContentSha256:"integration-reviewed"},
      ]});
      await prisma.expertComment.create({
        data: {
          fragmentId: articleV2.id,
          expertName: expert.displayName,
          expertTitle: expert.professionalTitle,
          authorId: expert.id,
          text: "Опубликованный именной комментарий.",
          status: "published",
        },
      });
      await prisma.issue.createMany({
        data: [
          {
            fragmentId: articleV2.id,
            type: "ambiguity",
            title: PUBLISHED_ISSUE_TITLE,
            description: "Описание подтверждённой проблемы.",
            status: "confirmed",
          },
          {
            fragmentId: articleV2.id,
            type: "ambiguity",
            title: DRAFT_MARKERS[2],
            description: "Описание гипотезы.",
            status: "hypothesis",
          },
        ],
      });
      await prisma.proposedRevision.createMany({
        data: [
          {
            fragmentId: articleV2.id,
            originalText: "Новый текст статьи 1.",
            proposedText: ACCEPTED_REVISION,
            rationale: "Обоснование принятой правки.",
            status: "accepted",
          },
          {
            fragmentId: articleV2.id,
            originalText: "Новый текст статьи 1.",
            proposedText: DRAFT_MARKERS[3],
            rationale: "Обоснование черновой правки.",
            status: "draft",
          },
        ],
      });
      await prisma.fragmentChangeExplanation.createMany({
        data: [
          {
            stableId: "63fz.article_1",
            fromVersionId: versionV1.id,
            toVersionId: versionV2.id,
            reason: PUBLISHED_CHANGE_REASON,
            status: "published",
          },
          {
            stableId: "63fz.article_2",
            fromVersionId: versionV1.id,
            toVersionId: versionV2.id,
            reason: DRAFT_MARKERS[4],
            status: "draft",
          },
        ],
      });

      lawData.clearReaderDataMemoryCache();
      const readerData = await lawData.getReaderData();

      assert.equal(readerData.isDemo, false);
      assert.deepEqual(
        readerData.versions.map((version) => version.id).sort(),
        [versionV1.id, versionV2.id].sort(),
        "public reader must list only published/archived versions",
      );
      assert.equal(readerData.selectedVersionId, versionV2.id);
      assert.equal(readerData.currentVersionId, versionV2.id);

      const serialized = JSON.stringify(readerData);
      assert.ok(serialized.includes(PUBLISHED_EXPLANATION));
      assert.ok(serialized.includes(PUBLISHED_EXPERT_NAME));
      assert.ok(!serialized.includes(PRIVATE_PASSWORD_HASH));
      assert.ok(!serialized.includes("integration.expert"));
      assert.ok(serialized.includes(PUBLISHED_ISSUE_TITLE));
      assert.ok(serialized.includes(ACCEPTED_REVISION));
      assert.ok(serialized.includes(PUBLISHED_CHANGE_REASON));
      assert.ok(serialized.includes(PUBLISHED_RECOMMENDATION));
      assert.ok(serialized.includes("Практические рекомендации"));
      assert.ok(serialized.includes("ИИ использован при подготовке"));
      assert.ok(!serialized.includes(versionDraft.id), "draft version id must not leak");
      for (const marker of DRAFT_MARKERS) {
        assert.ok(!serialized.includes(marker), `draft content must not leak: ${marker}`);
      }

      const article1 = readerData.fragments.find(
        (fragment) => fragment.stableId === "63fz.article_1",
      );
      assert.ok(article1, "article 1 must be present in reader fragments");
      const changedEntry = article1.changeHistory.find((entry) => entry.status === "changed");
      assert.ok(changedEntry, "article 1 must have a changed history entry");
      assert.equal(changedEntry.fromVersionId, versionV1.id);
      assert.equal(changedEntry.toVersionId, versionV2.id);
      assert.equal(changedEntry.hasPublishedExplanation, true);
      assert.equal(changedEntry.reason, PUBLISHED_CHANGE_REASON);

      const article2 = readerData.fragments.find(
        (fragment) => fragment.stableId === "63fz.article_2",
      );
      assert.ok(article2, "article 2 must be present in reader fragments");
      const introducedEntry = article2.changeHistory.find(
        (entry) => entry.status === "introduced",
      );
      assert.ok(introducedEntry, "article 2 must have an introduced history entry");
      assert.equal(
        introducedEntry.hasPublishedExplanation,
        false,
        "draft change explanation must not count as published",
      );

      lawData.clearReaderDataMemoryCache();
      const draftRequest = await lawData.getReaderData(versionDraft.id);
      assert.equal(
        draftRequest.selectedVersionId,
        versionV2.id,
        "requesting a draft version id must fall back to the current public version",
      );
      assert.ok(!JSON.stringify(draftRequest).includes(DRAFT_MARKERS[5]));

      lawData.clearReaderDataMemoryCache();
      const historicalRequest = await lawData.getReaderData(versionV1.id);
      assert.equal(historicalRequest.selectedVersionId, versionV1.id);
      const historicalArticle1 = historicalRequest.fragments.find(
        (fragment) => fragment.stableId === "63fz.article_1",
      );
      assert.ok(historicalArticle1);
      assert.equal(historicalArticle1.text, "Старый текст статьи 1.");
    } finally {
      await resetLaw();
      lawData.clearReaderDataMemoryCache();
      await prisma.$disconnect();
    }
  },
);
