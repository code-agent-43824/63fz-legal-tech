import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseCliOptions } from "../scripts/import-editorial-drafts";

test("draft import is dry-run unless --write is given", () => {
  assert.equal(parseCliOptions([]).write, false);
  assert.equal(parseCliOptions(["--dry-run"]).write, false);
  assert.equal(parseCliOptions(["--write"]).write, true);
  assert.equal(parseCliOptions(["--write", "--dry-run"]).write, false);
});

test("the pnpm argument separator is ignored", () => {
  assert.equal(parseCliOptions(["--", "--write"]).write, true);
  assert.equal(parseCliOptions(["--"]).write, false);
});

test("an unknown option fails loudly instead of being ignored", () => {
  assert.throws(() => parseCliOptions(["--publish"]), /Unknown or incomplete option/);
  assert.throws(() => parseCliOptions(["--status", "published"]), /Unknown or incomplete option/);
  assert.throws(() => parseCliOptions(["--draft-file"]), /Unknown or incomplete option/);
});

test("the script exposes no way to set a status or an origin", () => {
  const source = readFileSync("scripts/import-editorial-drafts.ts", "utf8");
  const createCall = source.slice(source.indexOf("plainExplanation.create"));

  assert.match(createCall, /status: "draft"/, "imported rows must always be drafts");
  assert.match(createCall, /origin: "ai_assisted"/, "imported rows must always keep ai origin");
  assert.doesNotMatch(
    source,
    /"published"|"in_review"|"unpublished"/,
    "the importer must not be able to write any public or review status",
  );
});

test("shipped article 13 drafts are well formed and target real fragment ids", () => {
  const file = JSON.parse(readFileSync("content/editorial-drafts/63fz-article-13.json", "utf8"));

  assert.equal(file.lawSlug, "63fz");
  assert.equal(file.requiresExpertReview, true);
  assert.ok(file.drafts.length > 0);

  for (const draft of file.drafts) {
    assert.match(
      draft.stableId,
      /^63fz(?:\.[a-z0-9_]+)+$/,
      `stableId must follow the fragment identity contract: ${draft.stableId}`,
    );
    assert.ok(draft.text.trim().length >= 40, `draft ${draft.stableId} is too short`);
  }
});
