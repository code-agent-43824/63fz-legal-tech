import assert from "node:assert/strict";
import test from "node:test";
import { buildTextDiffSummary } from "../src/lib/text-diff";

test("highlights changed text range in both versions", () => {
  const diff = buildTextDiffSummary(
    "one two old words five six",
    "one two new better words five six",
  );

  assert.deepEqual(
    diff.beforeSegments.filter((segment) => segment.changed).map((segment) => segment.text),
    ["old"],
  );
  assert.deepEqual(
    diff.afterSegments.filter((segment) => segment.changed).map((segment) => segment.text),
    ["new better"],
  );
});

test("keeps context around changed words", () => {
  const diff = buildTextDiffSummary("alpha beta gamma", "alpha beta delta");

  assert.equal(diff.beforeSnippet, "alpha beta gamma");
  assert.equal(diff.afterSnippet, "alpha beta delta");
});
