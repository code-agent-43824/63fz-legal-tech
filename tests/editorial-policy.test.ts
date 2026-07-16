import assert from "node:assert/strict";
import test from "node:test";
import {
  assertEditorialUsername,
  canCreateEditorialContent,
  canDeleteEditorialContent,
  canEditEditorialContent,
  type EditorialActor,
} from "../src/lib/editorial-policy";

const admin: EditorialActor = { kind: "env-admin", id: null, role: "admin", displayName: "Администратор", professionalTitle: null };
const expert: EditorialActor = { kind: "user", id: "expert-1", role: "expert", displayName: "Эксперт", professionalTitle: "Юрист" };

test("normalizes and validates invitation-only expert usernames", () => {
  assert.equal(assertEditorialUsername(" Expert.One "), "expert.one");
  assert.throws(() => assertEditorialUsername("admin"));
  assert.throws(() => assertEditorialUsername("эксперт"));
});

test("experts can author explanations and comments but not admin-only material", () => {
  assert.equal(canCreateEditorialContent(expert, "explanation"), true);
  assert.equal(canCreateEditorialContent(expert, "comment"), true);
  assert.equal(canCreateEditorialContent(expert, "issue"), false);
  assert.equal(canCreateEditorialContent(expert, "revision"), false);
  assert.equal(canCreateEditorialContent(admin, "issue"), true);
});

test("experts edit only their own contributions and cannot delete", () => {
  assert.equal(canEditEditorialContent(expert, "explanation", "expert-1"), true);
  assert.equal(canEditEditorialContent(expert, "comment", "expert-2"), false);
  assert.equal(canEditEditorialContent(expert, "issue", "expert-1"), false);
  assert.equal(canDeleteEditorialContent(expert), false);
  assert.equal(canDeleteEditorialContent(admin), true);
  assert.equal(canEditEditorialContent(admin, "revision", null), true);
});
