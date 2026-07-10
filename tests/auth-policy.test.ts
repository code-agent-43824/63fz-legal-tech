import assert from "node:assert/strict";
import test from "node:test";
import {
  getAuthConfigurationIssueForValues,
  isValidAdminPassword,
  isValidAuthSecret,
} from "../src/lib/auth-policy";

test("rejects missing and example auth secrets", () => {
  assert.equal(isValidAuthSecret(undefined), false);
  assert.equal(isValidAuthSecret("change-me-at-least-32-characters"), false);
});

test("rejects weak admin passwords", () => {
  assert.equal(isValidAdminPassword(undefined), false);
  assert.equal(isValidAdminPassword("change-me"), false);
  assert.equal(isValidAdminPassword("short"), false);
});

test("accepts non-example secrets that satisfy minimum lengths", () => {
  assert.equal(isValidAuthSecret("0123456789abcdef0123456789abcdef"), true);
  assert.equal(isValidAdminPassword("correct-horse-63fz"), true);
});

test("reports fail-closed auth configuration issues", () => {
  assert.match(
    getAuthConfigurationIssueForValues({
      adminPassword: "correct-horse-63fz",
      authSecret: undefined,
    }) ?? "",
    /AUTH_SECRET/,
  );

  assert.equal(
    getAuthConfigurationIssueForValues({
      adminPassword: "correct-horse-63fz",
      authSecret: "0123456789abcdef0123456789abcdef",
    }),
    null,
  );
});
