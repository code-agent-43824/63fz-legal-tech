import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBasePath, withBasePath } from "../src/lib/base-path";

test("normalizeBasePath keeps the default when the variable is not set", () => {
  assert.equal(normalizeBasePath(undefined), "/63fz");
  assert.equal(normalizeBasePath(null), "/63fz");
});

test("normalizeBasePath treats empty and root values as no base path", () => {
  assert.equal(normalizeBasePath(""), "");
  assert.equal(normalizeBasePath("   "), "");
  assert.equal(normalizeBasePath("/"), "");
});

test("normalizeBasePath accepts custom paths and normalizes slashes", () => {
  assert.equal(normalizeBasePath("/laws/63fz"), "/laws/63fz");
  assert.equal(normalizeBasePath("63fz"), "/63fz");
  assert.equal(normalizeBasePath("/63fz/"), "/63fz");
  assert.equal(normalizeBasePath("/63fz///"), "/63fz");
});

test("normalizeBasePath rejects unsafe values back to the default", () => {
  assert.equal(normalizeBasePath("/63fz?x=1"), "/63fz");
  assert.equal(normalizeBasePath("/пу ть"), "/63fz");
  assert.equal(normalizeBasePath("https://evil.example/63fz"), "/63fz");
  assert.equal(normalizeBasePath("/a//b"), "/63fz");
});

test("withBasePath prefixes app routes with the configured base path", (t) => {
  const original = process.env.NEXT_PUBLIC_BASE_PATH;
  t.after(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_BASE_PATH;
    } else {
      process.env.NEXT_PUBLIC_BASE_PATH = original;
    }
  });

  process.env.NEXT_PUBLIC_BASE_PATH = "/63fz";
  assert.equal(withBasePath("/admin"), "/63fz/admin");
  assert.equal(withBasePath("admin/changes"), "/63fz/admin/changes");
  assert.equal(withBasePath("/"), "/63fz");

  process.env.NEXT_PUBLIC_BASE_PATH = "";
  assert.equal(withBasePath("/admin"), "/admin");
  assert.equal(withBasePath("/"), "/");
});
