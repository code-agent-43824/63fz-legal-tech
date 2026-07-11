import assert from "node:assert/strict";
import test from "node:test";

import { buildMarkdownExport, type MarkdownExportData } from "../src/lib/markdown-export";

test("builds deterministic markdown with official and proposed text separated", () => {
  const data = makeExportData();
  const first = buildMarkdownExport(data);
  const second = buildMarkdownExport(data);

  assert.equal(first, second);
  assert.match(first, /^# Федеральный закон 63-ФЗ/m);
  assert.match(first, /### Официальный текст/);
  assert.match(first, /Официальный текст не заменен\. Принятое предложение:/);
  assert.match(first, /Принятая улучшенная редакция\./);
  assert.match(first, /Обоснование: Упростить чтение\./);
  assert.match(first, /Переход: Ред\. от 2023-08-04, действует с 15\.08\.2023 -> Ред\. от 2025-07-31, действует с 01\.03\.2026/);
  assert.match(first, /\[publication\.pravo\.gov\.ru\]\(https:\/\/publication\.pravo\.gov\.ru\/document\/1\)/);
  assert.doesNotMatch(first, /Черновик/);
});

function makeExportData(): MarkdownExportData {
  return {
    lawTitle: "Федеральный закон 63-ФЗ",
    versionLabel: "Ред. от 2025-07-31, действует с 01.03.2026",
    versionId: "63fz-current-2025-07-31",
    isCurrent: true,
    effectiveDate: "01.03.2026",
    sourceName: "Контур.Норматив",
    sourceUrl: "https://normativ.kontur.ru/document?documentId=504436&moduleId=1",
    sourceRetrievedAt: "11.07.2026",
    sourceTextSha256: "abc123",
    fragments: [
      {
        stableId: "63fz.article_18.part_2.point_8",
        parentStableId: "63fz.article_18.part_2",
        type: "point",
        title: "Пункт 8",
        text: "Официальный текст нормы.",
        plainExplanations: [{ authorName: null, text: "Публичное объяснение." }],
        expertComments: [
          {
            expertName: "Эксперт",
            expertTitle: "юрист",
            text: "Опубликованный комментарий.",
          },
        ],
        issues: [
          {
            severity: "medium",
            title: "Подтвержденная проблема",
            description: "Описание проблемы.",
          },
        ],
        proposedRevisions: [
          {
            proposedText: "Принятая улучшенная редакция.",
            rationale: "Упростить чтение.",
          },
        ],
        changeExplanations: [
          {
            fromVersionLabel: "Ред. от 2023-08-04, действует с 15.08.2023",
            toVersionLabel: "Ред. от 2025-07-31, действует с 01.03.2026",
            reason: "Введено 457-ФЗ.",
            purpose: "Уточнить полномочия.",
            practicalMeaning: "Практический смысл.",
            sourceLinks: "https://publication.pravo.gov.ru/document/1 Официальное опубликование",
          },
        ],
      },
    ],
  };
}
