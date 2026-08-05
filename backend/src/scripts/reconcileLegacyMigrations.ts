import { spawnSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LEGACY_DUPLICATE_MIGRATIONS = [
  "20260419165003_init",
  "20260422211153_init",
] as const;

const CURRENT_BASELINE_MIGRATION = "20260425000000_init";

/**
 * A non-empty database may only be auto-reconciled when it already contains
 * the complete canonical baseline shape. This prevents migration history from
 * being marked applied on an unknown or partially-created schema.
 */
const CANONICAL_SCHEMA_COLUMNS = [
  ["User", "id"],
  ["User", "email"],
  ["User", "displayName"],
  ["User", "passwordHash"],
  ["RefreshToken", "id"],
  ["RefreshToken", "userId"],
  ["RefreshToken", "tokenHash"],
  ["Room", "id"],
  ["Room", "code"],
  ["Room", "hostUserId"],
  ["Room", "status"],
  ["Room", "currentRound"],
  ["Room", "totalRounds"],
  ["RoomPlayer", "id"],
  ["RoomPlayer", "roomId"],
  ["RoomPlayer", "userId"],
  ["RoomPlayer", "seatIndex"],
  ["Round", "id"],
  ["Round", "roomId"],
  ["Round", "questionId"],
  ["Round", "difficulty"],
  ["Answer", "id"],
  ["Answer", "roundId"],
  ["Answer", "userId"],
  ["Answer", "isCorrect"],
  ["QuestionBank", "id"],
  ["QuestionBank", "prompt"],
  ["QuestionBank", "correctIndex"],
  ["QuestionBank", "difficulty"],
  ["QuestionBank", "isActive"],
  ["PowerUp", "id"],
  ["PowerUp", "code"],
  ["PowerUp", "isActive"],
  ["PlayerPowerUp", "userId"],
  ["PlayerPowerUp", "powerUpId"],
  ["PlayerPowerUp", "quantity"],
  ["XpEvent", "userId"],
  ["XpEvent", "reason"],
  ["XpEvent", "amount"],
] as const;

type CountRow = { count: bigint | number };
type MigrationRow = { migration_name: string };
type ColumnRow = { table_name: string; column_name: string };

interface BootstrapState {
  appTableCount: number;
  appliedMigrations: Set<string>;
  canonicalSchemaPresent: boolean;
}

async function loadBootstrapState(): Promise<BootstrapState> {
  const tableRows = await prisma.$queryRawUnsafe<CountRow[]>(`
    SELECT COUNT(*)::bigint AS count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'
  `);

  const migrationTableRows = await prisma.$queryRawUnsafe<CountRow[]>(`
    SELECT COUNT(*)::bigint AS count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = '_prisma_migrations'
  `);

  const migrationTableExists = Number(migrationTableRows[0]?.count ?? 0) > 0;
  const migrationRows = migrationTableExists
    ? await prisma.$queryRawUnsafe<MigrationRow[]>(`
        SELECT migration_name
        FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL
          AND rolled_back_at IS NULL
      `)
    : [];

  const columnRows = await prisma.$queryRawUnsafe<ColumnRow[]>(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  const availableColumns = new Set(
    columnRows.map((row) => `${row.table_name}.${row.column_name}`),
  );
  const canonicalSchemaPresent = CANONICAL_SCHEMA_COLUMNS.every(
    ([tableName, columnName]) =>
      availableColumns.has(`${tableName}.${columnName}`),
  );

  return {
    appTableCount: Number(tableRows[0]?.count ?? 0),
    appliedMigrations: new Set(migrationRows.map((row) => row.migration_name)),
    canonicalSchemaPresent,
  };
}

function resolveMigration(migrationName: string): void {
  const result = spawnSync(
    "npx",
    ["prisma", "migrate", "resolve", "--applied", migrationName],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );

  if (result.status !== 0) {
    throw new Error(`Failed to mark migration ${migrationName} as applied`);
  }
}

async function main(): Promise<void> {
  const state = await loadBootstrapState();
  const databaseIsEmpty = state.appTableCount === 0;
  const allowLegacyBaseline = process.env.PRISMA_RESOLVE_LEGACY_BASELINES === "1";
  const allowCurrentBaseline = process.env.PRISMA_BASELINE_CURRENT_INIT === "1";

  const migrationsToResolve = new Set<string>();

  // The first two migration directories are identical historical snapshots.
  // On a provably empty database, marking only those duplicates applied is safe;
  // the canonical baseline must still run to create the tables.
  //
  // Older production instances may already have the complete canonical schema
  // while their migration table contains missing or failed records from the
  // former best-effort startup script. In that known-safe case, all three
  // historical baseline records can be reconciled. Unknown or partial non-empty
  // databases remain fail-closed.
  if (databaseIsEmpty || state.canonicalSchemaPresent || allowLegacyBaseline) {
    for (const migrationName of LEGACY_DUPLICATE_MIGRATIONS) {
      if (!state.appliedMigrations.has(migrationName)) {
        migrationsToResolve.add(migrationName);
      }
    }
  }

  if (
    (state.canonicalSchemaPresent || allowCurrentBaseline) &&
    !state.appliedMigrations.has(CURRENT_BASELINE_MIGRATION)
  ) {
    migrationsToResolve.add(CURRENT_BASELINE_MIGRATION);
  }

  await prisma.$disconnect();

  if (migrationsToResolve.size === 0) {
    console.log("Migration history requires no baseline reconciliation.");
    return;
  }

  console.log(
    `Reconciling migration history for: ${[...migrationsToResolve].join(", ")}`,
  );

  for (const migrationName of migrationsToResolve) {
    resolveMigration(migrationName);
  }
}

main().catch(async (error: unknown) => {
  await prisma.$disconnect().catch(() => undefined);
  console.error(
    "Migration baseline reconciliation failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
