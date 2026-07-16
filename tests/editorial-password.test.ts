import assert from "node:assert/strict";
import test from "node:test";
import { hashEditorialPassword, verifyEditorialPassword } from "../src/lib/editorial-password";

test("editorial passwords use salted scrypt hashes", async () => {
  const password = "correct horse battery staple";
  const first = await hashEditorialPassword(password);
  const second = await hashEditorialPassword(password);
  assert.notEqual(first, second);
  assert.equal(first.includes(password), false);
  assert.equal(await verifyEditorialPassword(password, first), true);
  assert.equal(await verifyEditorialPassword("wrong password", first), false);
});

test("rejects short passwords and malformed hashes", async () => {
  await assert.rejects(() => hashEditorialPassword("too-short"));
  assert.equal(await verifyEditorialPassword("anything", "malformed"), false);
});
