import assert from "node:assert/strict";
import test from "node:test";
import {
  getTransitionChangeType,
  normalizeForComparison,
} from "../src/lib/change-history";

test("classifies unchanged fragments as no transition", () => {
  assert.equal(
    getTransitionChangeType({ text: "one   two" }, { text: "one two" }),
    null,
  );
});

test("classifies changed fragments", () => {
  assert.equal(
    getTransitionChangeType({ text: "old text" }, { text: "new text" }),
    "changed",
  );
});

test("classifies introduced fragments", () => {
  assert.equal(getTransitionChangeType(null, { text: "new text" }), "introduced");
});

test("classifies deleted fragments", () => {
  assert.equal(getTransitionChangeType({ text: "old text" }, null), "deleted");
});

test("normalizes whitespace before comparison", () => {
  assert.equal(normalizeForComparison(" one\n\n two\tthree "), "one two three");
});
