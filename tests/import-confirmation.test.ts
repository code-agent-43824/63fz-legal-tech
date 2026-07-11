import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCliOptions,
  validateCurrentConfirmation,
} from "../scripts/import-63fz";

test("importer does not set current by default", () => {
  const options = parseCliOptions([]);

  assert.equal(options.setCurrent, false);
});

test("requires exact confirmation before changing current version", () => {
  const options = parseCliOptions(["--set-current"]);

  assert.throws(
    () => validateCurrentConfirmation(options, "63fz-revision-2026-01-01"),
    /requires --confirm-set-current 63fz-revision-2026-01-01/,
  );
});

test("accepts explicit matching current-version confirmation", () => {
  const options = parseCliOptions([
    "--set-current",
    "--confirm-set-current",
    "63fz-revision-2026-01-01",
  ]);

  assert.doesNotThrow(() =>
    validateCurrentConfirmation(options, "63fz-revision-2026-01-01"),
  );
});
