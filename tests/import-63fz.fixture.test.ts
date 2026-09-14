import assert from "node:assert/strict";
import test from "node:test";
import {
  parseLawHtml,
  reconstructFullTextFromDetailedFragments,
  sha256,
  validateParsedLaw,
} from "../scripts/import-63fz";

const fixtureHtml = `
<html>
  <body>
    <div id="js-revisions-status">Редакция от 31.07.2025</div>
    <div id="js-doc-text-content-part">
      <p>ФЕДЕРАЛЬНЫЙ ЗАКОН
ОБ ЭЛЕКТРОННОЙ ПОДПИСИ</p>
      <h3>Статья 1. Общие положения</h3>
      <p class="dt-m1"><span class="dt-m">1.</span> 1. Первая часть.</p>
      <p class="dt-m2"><span class="dt-m">1)</span> 1) Первый пункт.</p>
      <p>Ненумерованный абзац.</p>
      <h3>Статья 16.1. Составная статья</h3>
      <p class="dt-m1"><span class="dt-m">1.</span> 1. Другая часть.</p>
    </div>
  </body>
</html>`;

test("importer fixture preserves stable IDs and detailed reconstruction", () => {
  const parsed = parseLawHtml(fixtureHtml, {
    effectiveDate: "2026-03-01",
    revisionDate: "2025-07-31",
  });

  assert.deepEqual(
    parsed.fragments.map((fragment) => fragment.stableId),
    [
      "63fz.document",
      "63fz.article_1",
      "63fz.article_1.part_1",
      "63fz.article_1.part_1.point_1",
      "63fz.article_1.part_1.paragraph_1",
      "63fz.article_16_1",
      "63fz.article_16_1.part_1",
    ],
  );
  assert.deepEqual(
    parsed.fragments.map((fragment) => fragment.title),
    [
      "Федеральный закон от 06.04.2011 N 63-ФЗ «Об электронной подписи»",
      "Статья 1. Общие положения",
      "Статья 1. Общие положения, часть 1",
      "Статья 1. Общие положения, часть 1, пункт 1",
      "Статья 1. Общие положения, часть 1, абзац 1",
      "Статья 16.1. Составная статья",
      "Статья 16.1. Составная статья, часть 1",
    ],
  );
  assert.equal(reconstructFullTextFromDetailedFragments(parsed), parsed.fullText);
  assert.equal(sha256(parsed.fullText).length, 64);
});

test("historical article sequences may omit only later inserted articles", () => {
  const articleHtml = Array.from(
    { length: 20 },
    (_, index) =>
      `<h3>Статья ${index + 1}. Историческая статья</h3><p>Исторический текст статьи ${index + 1}, достаточный для проверки.</p>`,
  ).join("");
  const parsed = parseLawHtml(
    `<div id="js-revisions-status">Редакция от 06.04.2011</div><div id="js-doc-text-content-part"><p>ФЕДЕРАЛЬНЫЙ ЗАКОН ОБ ЭЛЕКТРОННОЙ ПОДПИСИ</p>${articleHtml}</div>`,
    { effectiveDate: "2011-04-08", revisionDate: "2011-04-06" },
  );

  assert.equal(
    validateParsedLaw(parsed).some((warning) => warning.startsWith("Unexpected article sequence")),
    false,
  );

  parsed.articles.splice(9, 1);
  assert.equal(
    validateParsedLaw(parsed).some((warning) => warning.startsWith("Unexpected article sequence")),
    true,
  );
});
