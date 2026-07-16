import assert from "node:assert/strict";
import test from "node:test";

import {
  compareMigrations,
  parseCliOptions,
  type AppliedMigration,
  type LocalMigration,
} from "../scripts/check-database-operations";

const local: LocalMigration[] = [
  { checksum: "aaa", name: "001_init" },
  { checksum: "bbb", name: "002_feature" },
];

function applied(overrides: Partial<AppliedMigration> = {}): AppliedMigration {
  return {
    appliedStepsCount: 1,
    checksum: "aaa",
    finished: true,
    name: "001_init",
    rolledBack: false,
    ...overrides,
  };
}

test("parses database operations CLI options", () => {
  assert.deepEqual(parseCliOptions(["--json", "--runtime-role", "app", "--migrations-dir", "db"]), {
    json: true,
    migrationsDir: "db",
    runtimeRole: "app",
  });
  assert.throws(() => parseCliOptions(["--runtime-role"]), /Expected value/);
  assert.throws(() => parseCliOptions(["--unknown"]), /Unknown argument/);
});

test("accepts an exact clean migration history", () => {
  const result = compareMigrations(local, [
    applied(),
    applied({ checksum: "bbb", name: "002_feature" }),
  ]);

  assert.deepEqual(result, { appliedCount: 2, errors: [], localCount: 2 });
});

test("reports missing, changed, unfinished, and unknown migrations", () => {
  const result = compareMigrations(local, [
    applied({ checksum: "changed", finished: false }),
    applied({ checksum: "ccc", name: "999_unknown" }),
  ]);

  assert.deepEqual(result.errors, [
    "Migration is not in a clean finished state: 001_init",
    "Migration checksum mismatch: 001_init",
    "Migration is not recorded as applied: 002_feature",
    "Applied migration is missing locally: 999_unknown",
  ]);
});

test("ignores locally missing migrations that were rolled back", () => {
  const result = compareMigrations(local, [
    applied(),
    applied({ checksum: "bbb", name: "002_feature" }),
    applied({ name: "old_failed", rolledBack: true }),
  ]);

  assert.deepEqual(result.errors, []);
  assert.equal(result.appliedCount, 2);
});
