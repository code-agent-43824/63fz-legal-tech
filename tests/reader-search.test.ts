import assert from "node:assert/strict";
import test from "node:test";

import type { ReaderData } from "../src/lib/law-data";
import { buildReaderSearchResults } from "../src/lib/reader-search";

test("searches public law text, editorial blocks, and change history", () => {
  const readerData = makeReaderData();

  assert.equal(buildReaderSearchResults(readerData, "нотариальной").at(0)?.kind, "law-text");
  assert.equal(buildReaderSearchResults(readerData, "простое объяснение").at(0)?.kind, "editorial");
  assert.equal(buildReaderSearchResults(readerData, "457-ФЗ").at(0)?.kind, "change-history");
});

test("does not return results for short or absent queries", () => {
  const readerData = makeReaderData();

  assert.deepEqual(buildReaderSearchResults(readerData, "н"), []);
  assert.deepEqual(buildReaderSearchResults(readerData, "нет такого текста"), []);
});

function makeReaderData(): ReaderData {
  return {
    isDemo: false,
    versions: [],
    selectedVersionId: "current",
    currentVersionId: "current",
    selectedVersionLabel: "Текущая редакция",
    toc: [],
    fragments: [
      {
        id: "63fz.article_18.part_2.point_8",
        stableId: "63fz.article_18.part_2.point_8",
        parentStableId: "63fz.article_18.part_2",
        type: "point",
        title: "Пункт 8",
        text: "Текст закона про нотариальной доверенности.",
        changeStatus: "current",
        commentarySource: "selected",
        references: [],
        blocks: [{ title: "Простыми словами", text: "Простое объяснение нормы." }],
        changeHistory: [
          {
            changeId: "63fz.article_18.part_2.point_8..old..current",
            status: "introduced",
            stableId: "63fz.article_18.part_2.point_8",
            fromVersionId: "old",
            toVersionId: "current",
            versionId: "current",
            versionLabel: "Текущая редакция",
            previousVersionLabel: "Старая редакция",
            beforeSnippet: null,
            afterSnippet: "нотариальная доверенность",
            beforeSegments: [],
            afterSegments: [],
            hasPublishedExplanation: true,
            reason: "Введено 457-ФЗ.",
            purpose: "Уточнить полномочия.",
            practicalMeaning: "Практический смысл.",
            sourceLinks: [
              {
                href: "https://publication.pravo.gov.ru/document/0001202308040064",
                label: "publication.pravo.gov.ru",
              },
            ],
          },
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
