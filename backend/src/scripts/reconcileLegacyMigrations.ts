import { spawnSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LEGACY_DUPLICATE_MIGRATIONS = [
  "20260419165003_init",
  "20260422211153_init",
] as const;

const CURRENT_BASELINE_MIGRATION = "20260425000000_init";

type CountRow = { count: bigint | number };
type MigrationRow = { migration_name: string };

async function loadBootstrapState(): Promise<{
  appTableCount: number;
  appliedMigrations: Set<string>;
}> {
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

  return {
    appTableCount: Number(tableRows[0]?.count ?? 0),
    appliedMigrations: new Set(migrationRows.map((row) => row.migration_name)),
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
  // On a provably empty database, marking them applied is safe because the next
  // migration creates the complete baseline schema. Non-empty unknown databases
  // remain fail-closed unless the operator explicitly opts into reconciliation.
  if (databaseIsEmpty || allowLegacyBaseline) {
    for (const migrationName of LEGACY_DUPLICATE_MIGRATIONS) {
      if (!state.appliedMigrations.has(migrationName)) {
        migrationsToResolve.add(migrationName);
      }
    }
  }

  if (allowCurrentBaseline && !state.appliedMigrations.has(CURRENT_BASELINE_MIGRATION)) {
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
