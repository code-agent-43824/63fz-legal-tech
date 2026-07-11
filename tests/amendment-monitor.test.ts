import assert from "node:assert/strict";
import test from "node:test";

import {
  getLatestRevision,
  parseSourceRevisions,
} from "../scripts/monitor-63fz-amendments";

const fixtureHtml = `
<script>
window.__doc = {
  revisionsJSON: [
    {"moduleId":1,"documentId":100,"date":"2025-04-21T00:00:00+03:00","entryDate":"2025-09-01T00:00:00+03:00","status":1,"hasEntryDate":true},
    {"moduleId":1,"documentId":101,"date":"2025-07-31T00:00:00+03:00","entryDate":"2026-03-01T00:00:00+03:00","status":0,"hasEntryDate":true}
  ],
  other: true
}
</script>`;

test("parses source revisions from Kontur revisionsJSON", () => {
  const revisions = parseSourceRevisions(fixtureHtml);

  assert.equal(revisions.length, 2);
  assert.deepEqual(revisions[1], {
    moduleId: 1,
    documentId: 101,
    revisionDate: "2025-07-31",
    effectiveDate: "2026-03-01",
    status: 0,
    hasEntryDate: true,
    sourceUrl: "https://normativ.kontur.ru/document?moduleId=1&documentId=101",
  });
});

test("selects latest source revision by effective date", () => {
  const latest = getLatestRevision(parseSourceRevisions(fixtureHtml));

  assert.equal(latest.documentId, 101);
});
