import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const LEGACY_DUPLICATE_MIGRATIONS = [
  "20260419165003_init",
  "20260422211153_init",
] as const;
const CANONICAL_BASELINE = "20260425000000_init";
const REFRESH_TOKEN_MIGRATION = "20260621000000_unique_refresh_token_hash";
const ECONOMY_MIGRATION = "20260805130000_game_settlement_powerup_wagers";
const GUEST_LIFECYCLE_MIGRATION = "20260806190000_guest_lifecycle";
const EXPECTED_FRESH_MIGRATION_COUNT = 7;
const KNOWN_BASELINE_MIGRATIONS = [
  ...LEGACY_DUPLICATE_MIGRATIONS,
  CANONICAL_BASELINE,
] as const;

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function runPrisma(schemaPath: string): void {
  run("npx", ["prisma", "migrate", "deploy", "--schema", schemaPath]);
}

function migrationChecksum(prismaDir: string, migrationName: string): string {
  const sql = readFileSync(
    path.join(prismaDir, "migrations", migrationName, "migration.sql"),
  );
  return createHash("sha256").update(sql).digest("hex");
}

async function seedRepresentativeExistingData(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    INSERT INTO "User" ("id", "email", "displayName", "passwordHash", "updatedAt")
    VALUES
      ('migration-user-1', 'migration-1@example.com', 'Existing Player One', 'hash', CURRENT_TIMESTAMP),
      ('migration-user-2', 'migration-2@example.com', 'Existing Player Two', 'hash', CURRENT_TIMESTAMP),
      ('migration-guest-1', 'migration-guest-1@guest.quizroyale.invalid', 'Existing Guest', 'hash', CURRENT_TIMESTAMP)
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO "PowerUp" ("id", "code", "name", "description", "rarity", "cooldownSecs")
    VALUES ('migration-powerup-1', 'DOUBLE_DOWN', 'Double Down', 'Existing power-up', 'COMMON', 0)
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO "QuestionBank" (
      "id", "prompt", "optionA", "optionB", "optionC", "optionD",
      "correctIndex", "category", "difficulty"
    )
    VALUES (
      'migration-question-1', 'Existing question?', 'A', 'B', 'C', 'D',
      0, 'migration', 'EASY'
    )
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO "Room" ("id", "code", "hostUserId", "status", "currentRound", "totalRounds")
    VALUES ('migration-room-1', 'MIGR8', 'migration-user-1', 'GAME_OVER', 1, 10)
  `);

  // Historical data can contain duplicate seat indexes. New migrations must
  // preserve those rows rather than introducing an unrelated uniqueness failure.
  await prisma.$executeRawUnsafe(`
    INSERT INTO "RoomPlayer" (
      "id", "roomId", "userId", "seatIndex", "score", "isEliminated"
    )
    VALUES
      ('migration-room-player-1', 'migration-room-1', 'migration-user-1', 0, 900, false),
      ('migration-room-player-2', 'migration-room-1', 'migration-user-2', 0, 700, false)
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO "Round" (
      "id", "roomId", "roundNumber", "questionId", "difficulty", "startedAt", "resolvedAt"
    )
    VALUES (
      'migration-round-1', 'migration-room-1', 1, 'migration-question-1',
      'EASY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO "Answer" (
      "id", "roundId", "userId", "answerIndex", "isCorrect", "answerTimeMs"
    )
    VALUES ('migration-answer-1', 'migration-round-1', 'migration-user-1', 0, true, 1200)
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO "PlayerPowerUp" (
      "id", "userId", "powerUpId", "quantity", "updatedAt"
    )
    VALUES ('migration-inventory-1', 'migration-user-1', 'migration-powerup-1', 2, CURRENT_TIMESTAMP)
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO "XpEvent" ("id", "userId", "reason", "amount", "metadata")
    VALUES (
      'migration-xp-1', 'migration-user-1', 'EXISTING_GAME', 50,
      '{"source":"migration-rehearsal"}'::jsonb
    )
  `);
}

async function simulateFailedLegacyHistory(
  prisma: PrismaClient,
  prismaDir: string,
): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DELETE FROM "_prisma_migrations"
    WHERE migration_name IN (
      '20260419165003_init',
      '20260422211153_init',
      '20260425000000_init'
    )
  `);

  const firstLegacyChecksum = migrationChecksum(
    prismaDir,
    LEGACY_DUPLICATE_MIGRATIONS[0],
  );
  const canonicalChecksum = migrationChecksum(prismaDir, CANONICAL_BASELINE);

  // Simulate the state left by the former best-effort Railway startup: a
  // complete, populated schema with failed baseline records and one missing
  // duplicate record. Reconciliation must repair only this known-safe shape.
  await prisma.$executeRawUnsafe(`
    INSERT INTO "_prisma_migrations" (
      id, checksum, started_at, migration_name, logs,
      rolled_back_at, finished_at, applied_steps_count
    )
    VALUES
      (
        'simulated-failed-legacy-init',
        '${firstLegacyChecksum}',
        CURRENT_TIMESTAMP,
        '${LEGACY_DUPLICATE_MIGRATIONS[0]}',
        'Simulated legacy Railway migration failure',
        NULL,
        NULL,
        0
      ),
      (
        'simulated-failed-current-baseline',
        '${canonicalChecksum}',
        CURRENT_TIMESTAMP,
        '${CANONICAL_BASELINE}',
        'Simulated canonical baseline history failure',
        NULL,
        NULL,
        0
      )
  `);
}

async function simulatePartialPostBaselineHistory(
  prisma: PrismaClient,
  prismaDir: string,
): Promise<void> {
  const economyChecksum = migrationChecksum(prismaDir, ECONOMY_MIGRATION);

  // Simulate a PostgreSQL migration that stopped after its first table. The
  // former Railway startup ignored the failure, leaving both schema objects
  // and an unfinished Prisma migration record behind.
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PowerUpBetStatus') THEN
        CREATE TYPE "PowerUpBetStatus" AS ENUM ('PLACED', 'WON', 'LOST', 'REFUNDED');
      END IF;
    END
    $$
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PowerUpBet" (
      "id" VARCHAR(26) NOT NULL,
      "roomId" VARCHAR(26) NOT NULL,
      "roundId" VARCHAR(26) NOT NULL,
      "userId" VARCHAR(26) NOT NULL,
      "powerUpId" VARCHAR(26) NOT NULL,
      "quantity" INTEGER NOT NULL DEFAULT 1,
      "status" "PowerUpBetStatus" NOT NULL DEFAULT 'PLACED',
      "payoutQuantity" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "settledAt" TIMESTAMP(3),
      CONSTRAINT "PowerUpBet_pkey" PRIMARY KEY ("id")
    )
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO "_prisma_migrations" (
      id, checksum, started_at, migration_name, logs,
      rolled_back_at, finished_at, applied_steps_count
    )
    VALUES (
      'simulated-partial-economy-migration',
      '${economyChecksum}',
      CURRENT_TIMESTAMP,
      '${ECONOMY_MIGRATION}',
      'Simulated partial Railway economy migration',
      NULL,
      NULL,
      1
    )
  `);
}

async function verifyKnownBaselineHistory(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(`
    SELECT DISTINCT migration_name
    FROM "_prisma_migrations"
    WHERE migration_name IN (
      '20260419165003_init',
      '20260422211153_init',
      '20260425000000_init'
    )
      AND finished_at IS NOT NULL
      AND rolled_back_at IS NULL
  `);

  const applied = new Set(rows.map((row) => row.migration_name));
  const missing = KNOWN_BASELINE_MIGRATIONS.filter(
    (migrationName) => !applied.has(migrationName),
  );
  if (missing.length > 0) {
    throw new Error(
      `Legacy reconciliation did not finish baseline migrations: ${missing.join(", ")}`,
    );
  }
}

async function verifyUpgrade(prisma: PrismaClient): Promise<void> {
  const preservedUsers = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`
    SELECT COUNT(*)::bigint AS count
    FROM "User"
    WHERE "id" IN ('migration-user-1', 'migration-user-2')
  `);

  const duplicateSeats = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`
    SELECT COUNT(*)::bigint AS count
    FROM "RoomPlayer"
    WHERE "roomId" = 'migration-room-1' AND "seatIndex" = 0
  `);

  const newTables = await prisma.$queryRawUnsafe<
    Array<{ bets: string | null; settlements: string | null; rewards: string | null }>
  >(`
    SELECT
      to_regclass('"PowerUpBet"')::text AS bets,
      to_regclass('"GameSettlement"')::text AS settlements,
      to_regclass('"GameWinnerReward"')::text AS rewards
  `);

  const guestLifecycle = await prisma.$queryRawUnsafe<
    Array<{ is_guest: boolean; expires_at: Date | null }>
  >(`
    SELECT "isGuest" AS is_guest, "expiresAt" AS expires_at
    FROM "User"
    WHERE "id" = 'migration-guest-1'
  `);

  if (Number(preservedUsers[0]?.count ?? 0) !== 2) {
    throw new Error("Existing users were not preserved by the migration");
  }

  if (Number(duplicateSeats[0]?.count ?? 0) !== 2) {
    throw new Error("Historical room-player rows were not preserved");
  }

  if (!newTables[0]?.bets || !newTables[0]?.settlements || !newTables[0]?.rewards) {
    throw new Error("One or more settlement economy tables are missing");
  }

  if (!guestLifecycle[0]?.is_guest || !guestLifecycle[0]?.expires_at) {
    throw new Error("Existing guest accounts were not marked for expiration");
  }

  await prisma.$executeRawUnsafe(`
    INSERT INTO "GameSettlement" ("id", "roomId")
    VALUES ('migration-settlement-1', 'migration-room-1')
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO "PowerUpBet" (
      "id", "roomId", "roundId", "userId", "powerUpId", "quantity", "status"
    )
    VALUES (
      'migration-bet-1', 'migration-room-1', 'migration-round-1',
      'migration-user-1', 'migration-powerup-1', 1, 'PLACED'
    )
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO "GameWinnerReward" (
      "id", "roomId", "userId", "powerUpId", "quantity"
    )
    VALUES (
      'migration-reward-1', 'migration-room-1', 'migration-user-1',
      'migration-powerup-1', 1
    )
  `);
}

async function resetPublicSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS public CASCADE`);
  await prisma.$executeRawUnsafe(`CREATE SCHEMA public`);
}

async function verifyFreshDatabase(prisma: PrismaClient): Promise<void> {
  const migrationCount = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`
    SELECT COUNT(*)::bigint AS count
    FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
  `);

  const tables = await prisma.$queryRawUnsafe<
    Array<{ users: string | null; bets: string | null; settlements: string | null }>
  >(`
    SELECT
      to_regclass('"User"')::text AS users,
      to_regclass('"PowerUpBet"')::text AS bets,
      to_regclass('"GameSettlement"')::text AS settlements
  `);

  const guestColumns = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`
    SELECT COUNT(*)::bigint AS count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'User'
      AND column_name IN ('isGuest', 'expiresAt')
  `);

  if (Number(migrationCount[0]?.count ?? 0) !== EXPECTED_FRESH_MIGRATION_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_FRESH_MIGRATION_COUNT} applied migrations after fresh bootstrap; found ${migrationCount[0]?.count ?? 0}`,
    );
  }

  if (!tables[0]?.users || !tables[0]?.bets || !tables[0]?.settlements) {
    throw new Error("Fresh database bootstrap did not create the complete schema");
  }

  if (Number(guestColumns[0]?.count ?? 0) !== 2) {
    throw new Error("Fresh database bootstrap did not create guest lifecycle columns");
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for migration validation");
  }

  const prismaDir = path.resolve(process.cwd(), "prisma");
  const rehearsalDir = path.join(prismaDir, ".migration-rehearsal");
  const rehearsalMigrations = path.join(rehearsalDir, "migrations");
  const rehearsalSchema = path.join(rehearsalDir, "schema.prisma");

  rmSync(rehearsalDir, { recursive: true, force: true });
  mkdirSync(rehearsalMigrations, { recursive: true });

  copyFileSync(path.join(prismaDir, "schema.prisma"), rehearsalSchema);
  copyFileSync(
    path.join(prismaDir, "migrations", "migration_lock.toml"),
    path.join(rehearsalMigrations, "migration_lock.toml"),
  );

  for (const migrationName of [CANONICAL_BASELINE, REFRESH_TOKEN_MIGRATION]) {
    cpSync(
      path.join(prismaDir, "migrations", migrationName),
      path.join(rehearsalMigrations, migrationName),
      { recursive: true },
    );
  }

  let prisma = new PrismaClient();

  try {
    console.log("Rehearsing migration against representative existing data...");
    runPrisma(rehearsalSchema);
    await seedRepresentativeExistingData(prisma);
    await prisma.$disconnect();

    for (const migrationName of [ECONOMY_MIGRATION, GUEST_LIFECYCLE_MIGRATION]) {
      cpSync(
        path.join(prismaDir, "migrations", migrationName),
        path.join(rehearsalMigrations, migrationName),
        { recursive: true },
      );
    }

    runPrisma(rehearsalSchema);
    prisma = new PrismaClient();
    await verifyUpgrade(prisma);
    await prisma.$disconnect();

    // A second deploy must be a safe no-op.
    runPrisma(rehearsalSchema);

    console.log("Rehearsing recovery of a populated legacy Railway database...");
    prisma = new PrismaClient();
    await resetPublicSchema(prisma);
    await prisma.$disconnect();

    for (const migrationName of [ECONOMY_MIGRATION, GUEST_LIFECYCLE_MIGRATION]) {
      rmSync(path.join(rehearsalMigrations, migrationName), {
        recursive: true,
        force: true,
      });
    }
    runPrisma(rehearsalSchema);

    prisma = new PrismaClient();
    await seedRepresentativeExistingData(prisma);
    await simulateFailedLegacyHistory(prisma, prismaDir);
    await simulatePartialPostBaselineHistory(prisma, prismaDir);
    await prisma.$disconnect();

    run("npx", ["tsx", "src/scripts/reconcileLegacyMigrations.ts"]);
    run("npx", ["tsx", "src/scripts/repairKnownMigrations.ts"]);
    run("npx", ["prisma", "migrate", "deploy"]);

    prisma = new PrismaClient();
    await verifyKnownBaselineHistory(prisma);
    await verifyUpgrade(prisma);
    await prisma.$disconnect();

    // Recovery and later migrations must also be idempotent.
    run("npx", ["tsx", "src/scripts/reconcileLegacyMigrations.ts"]);
    run("npx", ["tsx", "src/scripts/repairKnownMigrations.ts"]);
    run("npx", ["prisma", "migrate", "deploy"]);

    console.log("Rehearsing a completely fresh production database bootstrap...");
    prisma = new PrismaClient();
    await resetPublicSchema(prisma);
    await prisma.$disconnect();

    run("npx", ["tsx", "src/scripts/reconcileLegacyMigrations.ts"]);
    run("npx", ["tsx", "src/scripts/repairKnownMigrations.ts"]);
    run("npx", ["prisma", "migrate", "deploy"]);

    prisma = new PrismaClient();
    await verifyFreshDatabase(prisma);
    await prisma.$disconnect();

    console.log(
      "Migration upgrade, partial-history repair, legacy recovery, and fresh-bootstrap rehearsals passed.",
    );
  } finally {
    await prisma.$disconnect().catch(() => undefined);
    if (existsSync(rehearsalDir)) {
      rmSync(rehearsalDir, { recursive: true, force: true });
    }
  }
}

main().catch((error: unknown) => {
  console.error(
    "Migration validation failed:",
    error instanceof Error ? error.stack ?? error.message : String(error),
  );
  process.exit(1);
});
