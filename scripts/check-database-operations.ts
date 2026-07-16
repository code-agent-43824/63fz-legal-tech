import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";

const DEFAULT_MIGRATIONS_DIR = "prisma/migrations";
const DEFAULT_RUNTIME_ROLE = "fz63_app";
export type LocalMigration = {
  checksum: string;
  name: string;
};

export type AppliedMigration = {
  appliedStepsCount: number;
  checksum: string;
  finished: boolean;
  name: string;
  rolledBack: boolean;
};

export type MigrationComparison = {
  errors: string[];
  localCount: number;
  appliedCount: number;
};

type CliOptions = {
  json: boolean;
  migrationsDir: string;
  runtimeRole: string;
};

type OwnershipRow = {
  object_name: string;
  owner_name: string;
};

type RuntimePrivilegeRow = {
  can_create_in_schema: boolean;
  can_delete: boolean;
  can_insert: boolean;
  can_select: boolean;
  can_update: boolean;
  object_name: string;
};

type MigrationRow = {
  applied_steps_count: number;
  checksum: string;
  finished_at: Date | null;
  migration_name: string;
  rolled_back_at: Date | null;
};

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required and must use the migration-owner role.");
  }

  const localMigrations = await readLocalMigrations(options.migrationsDir);
  const prisma = new PrismaClient();

  try {
    const report = await buildDatabaseOperationsReport(prisma, localMigrations, options.runtimeRole);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHumanReport(report);
    }

    if (!report.ok) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

export function parseCliOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    json: false,
    migrationsDir: DEFAULT_MIGRATIONS_DIR,
    runtimeRole: DEFAULT_RUNTIME_ROLE,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--migrations-dir") {
      options.migrationsDir = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--runtime-role") {
      options.runtimeRole = requireValue(args, index, arg);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function requireValue(args: string[], index: number, arg: string) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Expected value after ${arg}`);
  }
  return value;
}

export async function readLocalMigrations(migrationsDir: string): Promise<LocalMigration[]> {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const migrations: LocalMigration[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) {
      continue;
    }

    const migrationPath = path.join(migrationsDir, entry.name, "migration.sql");
    const sql = await readFile(migrationPath);
    migrations.push({
      checksum: createHash("sha256").update(sql).digest("hex"),
      name: entry.name,
    });
  }

  if (migrations.length === 0) {
    throw new Error(`No migration.sql files found in ${migrationsDir}.`);
  }

  return migrations;
}

export function compareMigrations(
  localMigrations: LocalMigration[],
  appliedMigrations: AppliedMigration[],
): MigrationComparison {
  const errors: string[] = [];
  const localByName = new Map(localMigrations.map((migration) => [migration.name, migration]));
  const appliedByName = new Map(appliedMigrations.map((migration) => [migration.name, migration]));

  for (const migration of localMigrations) {
    const applied = appliedByName.get(migration.name);
    if (!applied) {
      errors.push(`Migration is not recorded as applied: ${migration.name}`);
      continue;
    }
    // `prisma migrate resolve --applied` records a legitimate baseline with zero executed steps.
    if (!applied.finished || applied.rolledBack) {
      errors.push(`Migration is not in a clean finished state: ${migration.name}`);
    }
    if (migration.checksum !== applied.checksum) {
      errors.push(`Migration checksum mismatch: ${migration.name}`);
    }
  }

  for (const migration of appliedMigrations) {
    if (!localByName.has(migration.name) && !migration.rolledBack) {
      errors.push(`Applied migration is missing locally: ${migration.name}`);
    }
  }

  return {
    appliedCount: appliedMigrations.filter((migration) => !migration.rolledBack).length,
    errors,
    localCount: localMigrations.length,
  };
}

async function buildDatabaseOperationsReport(
  prisma: PrismaClient,
  localMigrations: LocalMigration[],
  runtimeRole: string,
) {
  const [identity] = await prisma.$queryRaw<Array<{ database_name: string; database_owner: string; migration_user: string }>>`
    SELECT
      current_database() AS database_name,
      current_user AS migration_user,
      pg_get_userbyid(datdba) AS database_owner
    FROM pg_database
    WHERE datname = current_database()
  `;

  const [migrationTable] = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS exists
  `;

  const errors: string[] = [];
  if (!identity) {
    errors.push("Could not determine database identity.");
  } else if (identity.database_owner !== identity.migration_user) {
    errors.push(
      `Migration connection user ${identity.migration_user} does not own database ${identity.database_name}.`,
    );
  }

  let migrationComparison: MigrationComparison = {
    appliedCount: 0,
    errors: ["_prisma_migrations table is absent."],
    localCount: localMigrations.length,
  };
  if (migrationTable?.exists) {
    const rows = await prisma.$queryRaw<MigrationRow[]>`
      SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
      FROM "_prisma_migrations"
      ORDER BY started_at, migration_name
    `;
    migrationComparison = compareMigrations(
      localMigrations,
      rows.map((row) => ({
        appliedStepsCount: row.applied_steps_count,
        checksum: row.checksum,
        finished: row.finished_at !== null,
        name: row.migration_name,
        rolledBack: row.rolled_back_at !== null,
      })),
    );
  }
  errors.push(...migrationComparison.errors);

  const ownership = await prisma.$queryRaw<OwnershipRow[]>`
    SELECT c.relname AS object_name, pg_get_userbyid(c.relowner) AS owner_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'S')
      AND c.relname <> '_prisma_migrations'
    UNION ALL
    SELECT t.typname AS object_name, pg_get_userbyid(t.typowner) AS owner_name
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype = 'e'
    ORDER BY object_name
  `;
  const unexpectedOwners = ownership.filter(
    (row) => identity && row.owner_name !== identity.migration_user,
  );
  for (const row of unexpectedOwners) {
    errors.push(`Schema object ${row.object_name} is owned by ${row.owner_name}.`);
  }

  const runtimePrivileges = await prisma.$queryRawUnsafe<RuntimePrivilegeRow[]>(
    `SELECT
       table_name AS object_name,
       has_table_privilege($1, format('%I.%I', table_schema, table_name), 'SELECT') AS can_select,
       has_table_privilege($1, format('%I.%I', table_schema, table_name), 'INSERT') AS can_insert,
       has_table_privilege($1, format('%I.%I', table_schema, table_name), 'UPDATE') AS can_update,
       has_table_privilege($1, format('%I.%I', table_schema, table_name), 'DELETE') AS can_delete,
       has_schema_privilege($1, 'public', 'CREATE') AS can_create_in_schema
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
     ORDER BY table_name`,
    runtimeRole,
  );
  if (runtimePrivileges.length === 0) {
    errors.push("Runtime privilege check found no application tables.");
  }
  for (const row of runtimePrivileges) {
    if (!row.can_select || !row.can_insert || !row.can_update || !row.can_delete) {
      errors.push(`Runtime role ${runtimeRole} lacks CRUD privileges on ${row.object_name}.`);
    }
    if (row.can_create_in_schema) {
      errors.push(`Runtime role ${runtimeRole} can CREATE in public schema.`);
    }
  }

  const [lawState] = await prisma.$queryRaw<Array<{ current_version_id: string | null; law_count: bigint }>>`
    SELECT count(*)::bigint AS law_count, max("currentVersionId") AS current_version_id
    FROM "Law"
    WHERE slug = '63fz'
  `;
  if (!lawState || Number(lawState.law_count) !== 1 || !lawState.current_version_id) {
    errors.push("Expected exactly one 63fz law with a current version.");
  }

  return {
    database: identity ?? null,
    migrationComparison,
    objectCount: ownership.length,
    ok: errors.length === 0,
    runtimeRole,
    runtimeTableCount: runtimePrivileges.length,
    errors,
  };
}

function printHumanReport(report: Awaited<ReturnType<typeof buildDatabaseOperationsReport>>) {
  console.log(`Database: ${report.database?.database_name ?? "unknown"}`);
  console.log(`Migration owner: ${report.database?.migration_user ?? "unknown"}`);
  console.log(`Database owner: ${report.database?.database_owner ?? "unknown"}`);
  console.log(
    `Migrations: ${report.migrationComparison.appliedCount}/${report.migrationComparison.localCount} applied`,
  );
  console.log(`Schema objects checked: ${report.objectCount}`);
  console.log(`Runtime tables checked for ${report.runtimeRole}: ${report.runtimeTableCount}`);
  console.log(`Verdict: ${report.ok ? "PASS" : "FAIL"}`);
  for (const error of report.errors) {
    console.log(`- ${error}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
