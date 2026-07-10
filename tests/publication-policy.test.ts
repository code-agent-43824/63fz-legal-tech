import assert from "node:assert/strict";
import test from "node:test";
import { PUBLIC_READER_STATUSES } from "../src/lib/publication-policy";

test("public reader status policy excludes drafts and internal review states", () => {
  assert.deepEqual(PUBLIC_READER_STATUSES, {
    changeExplanation: "published",
    expertComment: "published",
    issue: "confirmed",
    plainExplanation: "published",
    proposedRevision: "accepted",
  });
});
