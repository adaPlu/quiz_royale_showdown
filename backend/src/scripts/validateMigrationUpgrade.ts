import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const CANONICAL_BASELINE = "20260425000000_init";
const REFRESH_TOKEN_MIGRATION = "20260621000000_unique_refresh_token_hash";
const ECONOMY_MIGRATION = "20260805130000_game_settlement_powerup_wagers";

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

async function seedRepresentativeExistingData(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    INSERT INTO "User" ("id", "email", "displayName", "passwordHash", "updatedAt")
    VALUES
      ('migration-user-1', 'migration-1@example.com', 'Existing Player One', 'hash', CURRENT_TIMESTAMP),
      ('migration-user-2', 'migration-2@example.com', 'Existing Player Two', 'hash', CURRENT_TIMESTAMP)
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

  // Historical data can contain duplicate seat indexes. The new migration must
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

  if (Number(preservedUsers[0]?.count ?? 0) !== 2) {
    throw new Error("Existing users were not preserved by the migration");
  }

  if (Number(duplicateSeats[0]?.count ?? 0) !== 2) {
    throw new Error("Historical room-player rows were not preserved");
  }

  if (!newTables[0]?.bets || !newTables[0]?.settlements || !newTables[0]?.rewards) {
    throw new Error("One or more settlement economy tables are missing");
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

  if (Number(migrationCount[0]?.count ?? 0) !== 5) {
    throw new Error(
      `Expected 5 applied migrations after fresh bootstrap; found ${migrationCount[0]?.count ?? 0}`,
    );
  }

  if (!tables[0]?.users || !tables[0]?.bets || !tables[0]?.settlements) {
    throw new Error("Fresh database bootstrap did not create the complete schema");
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

    cpSync(
      path.join(prismaDir, "migrations", ECONOMY_MIGRATION),
      path.join(rehearsalMigrations, ECONOMY_MIGRATION),
      { recursive: true },
    );

    runPrisma(rehearsalSchema);
    prisma = new PrismaClient();
    await verifyUpgrade(prisma);
    await prisma.$disconnect();

    // A second deploy must be a safe no-op.
    runPrisma(rehearsalSchema);

    console.log("Rehearsing a completely fresh production database bootstrap...");
    prisma = new PrismaClient();
    await resetPublicSchema(prisma);
    await prisma.$disconnect();

    run("npx", ["tsx", "src/scripts/reconcileLegacyMigrations.ts"]);
    run("npx", ["prisma", "migrate", "deploy"]);

    prisma = new PrismaClient();
    await verifyFreshDatabase(prisma);
    await prisma.$disconnect();

    console.log("Migration upgrade and fresh-bootstrap rehearsals passed.");
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
