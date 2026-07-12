import assert from "node:assert/strict";
import test from "node:test";

import {
  createBoundedFeedbackRateLimiter,
  validateChangeFeedbackTransition,
  type FeedbackValidationVersion,
} from "../src/lib/change-feedback";

const versions: FeedbackValidationVersion[] = [
  version("old", "law-63fz", "2024-01-01"),
  version("middle", "law-63fz", "2025-01-01"),
  version("new", "law-63fz", "2026-01-01"),
];

test("allows a real changed transition", () => {
  const result = validateChangeFeedbackTransition({
    fragments: [
      fragment("old", "63fz.article_1", "old text"),
      fragment("middle", "63fz.article_1", "new text"),
    ],
    fromVersion: versions[0],
    kind: "useful",
    publicVersions: versions,
    stableId: "63fz.article_1",
    toVersion: versions[1],
  });

  assert.deepEqual(result, { ok: true, changeType: "changed" });
});

test("allows introduced and deleted transitions", () => {
  assert.deepEqual(
    validateChangeFeedbackTransition({
      fragments: [fragment("middle", "63fz.article_2", "introduced text")],
      fromVersion: versions[0],
      kind: "unclear",
      publicVersions: versions,
      stableId: "63fz.article_2",
      toVersion: versions[1],
    }),
    { ok: true, changeType: "introduced" },
  );

  assert.deepEqual(
    validateChangeFeedbackTransition({
      fragments: [fragment("old", "63fz.article_3", "deleted text")],
      fromVersion: versions[0],
      kind: "error",
      publicVersions: versions,
      stableId: "63fz.article_3",
      toVersion: versions[1],
    }),
    { ok: true, changeType: "deleted" },
  );
});

test("rejects unchanged and unknown stable IDs", () => {
  assert.equal(
    validateChangeFeedbackTransition({
      fragments: [
        fragment("old", "63fz.article_1", "same text"),
        fragment("middle", "63fz.article_1", "same   text"),
      ],
      fromVersion: versions[0],
      kind: "useful",
      publicVersions: versions,
      stableId: "63fz.article_1",
      toVersion: versions[1],
    }).ok,
    false,
  );

  assert.equal(
    validateChangeFeedbackTransition({
      fragments: [],
      fromVersion: versions[0],
      kind: "useful",
      publicVersions: versions,
      stableId: "63fz.article_missing",
      toVersion: versions[1],
    }).ok,
    false,
  );
});

test("rejects cross-law and non-adjacent transitions", () => {
  assert.equal(
    validateChangeFeedbackTransition({
      fragments: [
        fragment("old", "63fz.article_1", "old text"),
        fragment("foreign", "63fz.article_1", "new text"),
      ],
      fromVersion: versions[0],
      kind: "useful",
      publicVersions: [...versions, version("foreign", "other-law", "2025-01-01")],
      stableId: "63fz.article_1",
      toVersion: version("foreign", "other-law", "2025-01-01"),
    }).ok,
    false,
  );

  assert.equal(
    validateChangeFeedbackTransition({
      fragments: [
        fragment("old", "63fz.article_1", "old text"),
        fragment("new", "63fz.article_1", "new text"),
      ],
      fromVersion: versions[0],
      kind: "useful",
      publicVersions: versions,
      stableId: "63fz.article_1",
      toVersion: versions[2],
    }).ok,
    false,
  );
});

test("rejects unsupported feedback kind", () => {
  assert.equal(
    validateChangeFeedbackTransition({
      fragments: [
        fragment("old", "63fz.article_1", "old text"),
        fragment("middle", "63fz.article_1", "new text"),
      ],
      fromVersion: versions[0],
      kind: "surprise",
      publicVersions: versions,
      stableId: "63fz.article_1",
      toVersion: versions[1],
    }).ok,
    false,
  );
});

test("feedback rate-limit storage remains bounded and prunes stale buckets", () => {
  const limiter = createBoundedFeedbackRateLimiter({
    limit: 2,
    maxBuckets: 3,
    windowMs: 100,
  });

  assert.equal(limiter.enforce("a", 1), true);
  assert.equal(limiter.enforce("b", 2), true);
  assert.equal(limiter.enforce("c", 3), true);
  assert.equal(limiter.enforce("d", 4), true);
  assert.equal(limiter.state().buckets, 3);
  assert.deepEqual(limiter.state().keys, ["b", "c", "d"]);

  assert.equal(limiter.enforce("e", 200), true);
  assert.equal(limiter.state().buckets, 1);
  assert.deepEqual(limiter.state().keys, ["e"]);
});

function version(
  id: string,
  lawId: string,
  effectiveDate: string,
  status = "published",
): FeedbackValidationVersion {
  return {
    createdAt: `${effectiveDate}T00:00:00.000Z`,
    effectiveDate: `${effectiveDate}T00:00:00.000Z`,
    id,
    lawId,
    status,
  };
}

function fragment(lawVersionId: string, stableId: string, text: string) {
  return {
    lawVersionId,
    stableId,
    text,
  };
}
