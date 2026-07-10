import assert from "node:assert/strict";
import test from "node:test";

test("public reader returns deterministic demo data without DATABASE_URL", async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  try {
    const { getReaderData } = await import("../src/lib/law-data");
    const data = await getReaderData();

    assert.equal(data.isDemo, true);
    assert.equal(data.selectedVersionLabel, "DEMO DATA");
    assert.ok(data.fragments.length > 0);
    assert.equal(data.fragments.every((fragment) => fragment.blocks.length === 0), true);
  } finally {
    restoreEnv("DATABASE_URL", previousDatabaseUrl);
  }
});

test("admin fragment list returns deterministic demo data without DATABASE_URL", async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  try {
    const { getAdminFragments } = await import("../src/lib/admin-data");
    const fragments = await getAdminFragments();

    assert.equal(fragments.length, 1);
    assert.equal(fragments[0].stableId, "63fz.article_1");
  } finally {
    restoreEnv("DATABASE_URL", previousDatabaseUrl);
  }
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
