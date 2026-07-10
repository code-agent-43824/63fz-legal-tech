import assert from "node:assert/strict";
import test from "node:test";
import {
  parseLawHtml,
  reconstructFullTextFromDetailedFragments,
  sha256,
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
  assert.equal(reconstructFullTextFromDetailedFragments(parsed), parsed.fullText);
  assert.equal(sha256(parsed.fullText).length, 64);
});
