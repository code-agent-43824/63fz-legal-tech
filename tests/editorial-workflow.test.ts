import assert from "node:assert/strict";
import test from "node:test";
import type { EditorialActor } from "../src/lib/editorial-policy";
import {
  assertEditorialDraftOrigin,
  assertExpertContributionKind,
  canPublishEditorialReview,
  canSubmitEditorialReview,
  canUnpublishEditorialContribution,
  hashEditorialContent,
  readEditorialReviewChecklist,
} from "../src/lib/editorial-workflow";

const admin: EditorialActor = { kind: "env-admin", id: null, role: "admin", displayName: "Администратор", professionalTitle: null };
const expert: EditorialActor = { kind: "user", id: "expert-1", role: "expert", displayName: "Эксперт", professionalTitle: "Юрист" };
const otherExpert: EditorialActor = { kind: "user", id: "expert-2", role: "expert", displayName: "Другой", professionalTitle: null };
const completeChecklist = { factualAccuracy: true, sources: true, scope: true, version: true, responsibility: true };

test("only the responsible expert can submit and publish a reviewed contribution", () => {
  assert.equal(canSubmitEditorialReview(expert, "expert-1", "draft"), true);
  assert.equal(canSubmitEditorialReview(otherExpert, "expert-1", "draft"), false);
  assert.equal(canSubmitEditorialReview(admin, "expert-1", "draft"), false);
  assert.equal(canPublishEditorialReview(expert, "expert-1", "in_review", completeChecklist), true);
  assert.equal(canPublishEditorialReview(expert, "expert-1", "draft", completeChecklist), false);
  assert.equal(canPublishEditorialReview(expert, "expert-1", "in_review", { ...completeChecklist, sources: false }), false);
});

test("owner or administrator can unpublish, but publication state is required", () => {
  assert.equal(canUnpublishEditorialContribution(expert, "expert-1", "published"), true);
  assert.equal(canUnpublishEditorialContribution(otherExpert, "expert-1", "published"), false);
  assert.equal(canUnpublishEditorialContribution(admin, "expert-1", "published"), true);
  assert.equal(canUnpublishEditorialContribution(admin, "expert-1", "draft"), false);
});

test("review checklist requires five explicit confirmations", () => {
  const form = new FormData();
  for (const key of ["reviewFactualAccuracy", "reviewSources", "reviewScope", "reviewVersion", "reviewResponsibility"]) form.set(key, "yes");
  assert.deepEqual(readEditorialReviewChecklist(form), completeChecklist);
  form.delete("reviewVersion");
  assert.equal(readEditorialReviewChecklist(form).version, false);
});

test("content hashes are deterministic and sensitive to reviewed fields", () => {
  const first = hashEditorialContent(["text", "source"]);
  assert.equal(first, hashEditorialContent(["text", "source"]));
  assert.notEqual(first, hashEditorialContent(["changed", "source"]));
});

test("origin and recommendation kind reject unsupported values", () => {
  assert.equal(assertEditorialDraftOrigin("ai_assisted"), "ai_assisted");
  assert.equal(assertExpertContributionKind("recommendation"), "recommendation");
  assert.throws(() => assertEditorialDraftOrigin("generated"));
  assert.throws(() => assertExpertContributionKind("advice"));
});
