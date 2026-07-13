import assert from "node:assert/strict";
import test from "node:test";

import {
  extractKonturSourceIds,
  getLawVersionSourceIdentity,
  getLatestRevision,
  getMonitorRevisionAvailability,
  getSourceRevisionIdentity,
  parseSourceRevisions,
  sourceIdentitiesMatch,
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

test("recognizes Kontur source IDs regardless of query parameter order", () => {
  assert.deepEqual(
    extractKonturSourceIds("https://normativ.kontur.ru/document?documentId=504436&moduleId=1"),
    { documentId: 504436, moduleId: 1 },
  );
  assert.deepEqual(
    extractKonturSourceIds("https://normativ.kontur.ru/document?moduleId=1&documentId=504436"),
    { documentId: 504436, moduleId: 1 },
  );
});

test("rejects malformed or unsafe Kontur source URLs", () => {
  const rejected = [
    null,
    "not a url",
    "http://normativ.kontur.ru/document?moduleId=1&documentId=504436",
    "https://example.com/document?moduleId=1&documentId=504436",
    "https://normativ.kontur.ru.evil.test/document?moduleId=1&documentId=504436",
    "https://normativ.kontur.ru/document?documentId=504436",
    "https://normativ.kontur.ru/document?moduleId=1",
    "https://normativ.kontur.ru/document?moduleId=&documentId=504436",
    "https://normativ.kontur.ru/document?moduleId=0&documentId=504436",
    "https://normativ.kontur.ru/document?moduleId=-1&documentId=504436",
    "https://normativ.kontur.ru/document?moduleId=1.5&documentId=504436",
    "https://normativ.kontur.ru/document?moduleId=9007199254740992&documentId=504436",
  ];

  for (const sourceUrl of rejected) {
    assert.equal(extractKonturSourceIds(sourceUrl), null, sourceUrl ?? "null");
  }
});

test("matches imported versions only by exact source identity", () => {
  const latest = getSourceRevisionIdentity({
    documentId: 504436,
    effectiveDate: "2026-03-01",
    hasEntryDate: true,
    moduleId: 1,
    revisionDate: "2025-07-31",
    sourceUrl: "https://normativ.kontur.ru/document?moduleId=1&documentId=504436",
    status: 0,
  });
  const imported = getLawVersionSourceIdentity({
    effectiveDate: "2026-03-01",
    sourceUrl: "https://normativ.kontur.ru/document?documentId=504436&moduleId=1",
    title: "63-ФЗ (ред. от 31.07.2025)",
  });

  assert.equal(sourceIdentitiesMatch(latest, imported), true);
  assert.equal(
    sourceIdentitiesMatch(latest, {
      ...latest,
      effectiveDate: "2025-09-01",
    }),
    false,
  );
  assert.equal(
    sourceIdentitiesMatch(latest, {
      ...latest,
      documentId: 501137,
    }),
    false,
  );
});

test("does not report an already imported exact source identity as newly available", () => {
  assert.equal(
    getMonitorRevisionAvailability({
      currentVersion: {
        effectiveDate: "2025-09-01",
        id: "older-current",
        revisionDate: "2025-04-21",
        sourceUrl: "https://normativ.kontur.ru/document?moduleId=1&documentId=501137",
      },
      latestRevision: {
        documentId: 504436,
        effectiveDate: "2026-03-01",
        hasEntryDate: true,
        moduleId: 1,
        revisionDate: "2025-07-31",
        sourceUrl: "https://normativ.kontur.ru/document?moduleId=1&documentId=504436",
        status: 0,
      },
      latestVersionAlreadyImported: true,
    }),
    false,
  );
});
