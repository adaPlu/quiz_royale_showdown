import { spawnSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const REFRESH_TOKEN_MIGRATION = "20260621000000_unique_refresh_token_hash";
const ECONOMY_MIGRATION = "20260805130000_game_settlement_powerup_wagers";
const GUEST_LIFECYCLE_MIGRATION = "20260806190000_guest_lifecycle";

const KNOWN_POST_BASELINE_MIGRATIONS = [
  REFRESH_TOKEN_MIGRATION,
  ECONOMY_MIGRATION,
  GUEST_LIFECYCLE_MIGRATION,
] as const;

type KnownMigration = (typeof KNOWN_POST_BASELINE_MIGRATIONS)[number];
type CountRow = { count: bigint | number };
type MigrationRow = { migration_name: string };

async function tableExists(tableName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<CountRow[]>(`
    SELECT COUNT(*)::bigint AS count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = '${tableName.replaceAll("'", "''")}'
  `);
  return Number(rows[0]?.count ?? 0) > 0;
}

async function migrationTableExists(): Promise<boolean> {
  return tableExists("_prisma_migrations");
}

async function loadAppliedMigrations(): Promise<Set<string>> {
  if (!(await migrationTableExists())) return new Set();

  const rows = await prisma.$queryRawUnsafe<MigrationRow[]>(`
    SELECT DISTINCT migration_name
    FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL
      AND rolled_back_at IS NULL
  `);
  return new Set(rows.map((row) => row.migration_name));
}

function resolveApplied(migrationName: KnownMigration): void {
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
    throw new Error(`Failed to mark repaired migration ${migrationName} as applied`);
  }
}

async function repairRefreshTokenMigration(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    WITH ranked_tokens AS (
      SELECT
        "id",
        ROW_NUMBER() OVER (
          PARTITION BY "tokenHash"
          ORDER BY "createdAt" DESC, "id" DESC
        ) AS row_number
      FROM "RefreshToken"
    )
    DELETE FROM "RefreshToken"
    WHERE "id" IN (
      SELECT "id"
      FROM ranked_tokens
      WHERE row_number > 1
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_tokenHash_key"
    ON "RefreshToken"("tokenHash")
  `);
}

async function repairEconomyMigration(): Promise<void> {
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
    CREATE TABLE IF NOT EXISTS "GameSettlement" (
      "id" VARCHAR(26) NOT NULL,
      "roomId" VARCHAR(26) NOT NULL,
      "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "GameSettlement_pkey" PRIMARY KEY ("id")
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "GameWinnerReward" (
      "id" VARCHAR(26) NOT NULL,
      "roomId" VARCHAR(26) NOT NULL,
      "userId" VARCHAR(26) NOT NULL,
      "powerUpId" VARCHAR(26) NOT NULL,
      "quantity" INTEGER NOT NULL DEFAULT 1,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "GameWinnerReward_pkey" PRIMARY KEY ("id")
    )
  `);

  const indexes = [
    `CREATE INDEX IF NOT EXISTS "RefreshToken_userId_expiresAt_idx" ON "RefreshToken"("userId", "expiresAt")`,
    `CREATE INDEX IF NOT EXISTS "Room_status_createdAt_idx" ON "Room"("status", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "Room_hostUserId_idx" ON "Room"("hostUserId")`,
    `CREATE INDEX IF NOT EXISTS "QuestionBank_isActive_difficulty_lastUsedAt_idx" ON "QuestionBank"("isActive", "difficulty", "lastUsedAt")`,
    `CREATE INDEX IF NOT EXISTS "XpEvent_userId_createdAt_idx" ON "XpEvent"("userId", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "Season_startsAt_endsAt_idx" ON "Season"("startsAt", "endsAt")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PowerUpBet_roundId_userId_key" ON "PowerUpBet"("roundId", "userId")`,
    `CREATE INDEX IF NOT EXISTS "PowerUpBet_roomId_status_idx" ON "PowerUpBet"("roomId", "status")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "GameSettlement_roomId_key" ON "GameSettlement"("roomId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "GameWinnerReward_roomId_userId_key" ON "GameWinnerReward"("roomId", "userId")`,
    `CREATE INDEX IF NOT EXISTS "GameWinnerReward_userId_createdAt_idx" ON "GameWinnerReward"("userId", "createdAt")`,
  ];

  for (const statement of indexes) {
    await prisma.$executeRawUnsafe(statement);
  }

  const foreignKeys = [
    ["PowerUpBet_roomId_fkey", `ALTER TABLE "PowerUpBet" ADD CONSTRAINT "PowerUpBet_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
    ["PowerUpBet_roundId_fkey", `ALTER TABLE "PowerUpBet" ADD CONSTRAINT "PowerUpBet_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
    ["PowerUpBet_userId_fkey", `ALTER TABLE "PowerUpBet" ADD CONSTRAINT "PowerUpBet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
    ["PowerUpBet_powerUpId_fkey", `ALTER TABLE "PowerUpBet" ADD CONSTRAINT "PowerUpBet_powerUpId_fkey" FOREIGN KEY ("powerUpId") REFERENCES "PowerUp"("id") ON DELETE RESTRICT ON UPDATE CASCADE`],
    ["GameSettlement_roomId_fkey", `ALTER TABLE "GameSettlement" ADD CONSTRAINT "GameSettlement_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
    ["GameWinnerReward_roomId_fkey", `ALTER TABLE "GameWinnerReward" ADD CONSTRAINT "GameWinnerReward_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
    ["GameWinnerReward_userId_fkey", `ALTER TABLE "GameWinnerReward" ADD CONSTRAINT "GameWinnerReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
    ["GameWinnerReward_powerUpId_fkey", `ALTER TABLE "GameWinnerReward" ADD CONSTRAINT "GameWinnerReward_powerUpId_fkey" FOREIGN KEY ("powerUpId") REFERENCES "PowerUp"("id") ON DELETE RESTRICT ON UPDATE CASCADE`],
  ] as const;

  for (const [constraintName, statement] of foreignKeys) {
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = '${constraintName}'
        ) THEN
          ${statement};
        END IF;
      END
      $$
    `);
  }
}

async function repairGuestLifecycleMigration(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "isGuest" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3)
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE "User"
    SET
      "isGuest" = true,
      "expiresAt" = COALESCE("expiresAt", "createdAt" + INTERVAL '24 hours')
    WHERE "email" LIKE '%@guest.quizroyale.invalid'
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "User_isGuest_expiresAt_idx"
    ON "User"("isGuest", "expiresAt")
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Room"
      ADD COLUMN IF NOT EXISTS "isPrivate" BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "maxPlayers" INTEGER NOT NULL DEFAULT 8,
      ADD COLUMN IF NOT EXISTS "autoStartSolo" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "gameDifficulty" VARCHAR(10) NOT NULL DEFAULT 'medium'
  `);

  const checks = [
    ["Room_maxPlayers_check", `CHECK ("maxPlayers" BETWEEN 2 AND 100)`],
    ["Room_gameDifficulty_check", `CHECK ("gameDifficulty" IN ('easy', 'medium', 'hard'))`],
  ] as const;

  for (const [constraintName, expression] of checks) {
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = '${constraintName}'
        ) THEN
          ALTER TABLE "Room" ADD CONSTRAINT "${constraintName}" ${expression};
        END IF;
      END
      $$
    `);
  }
}

async function verifyMigrationShape(migrationName: KnownMigration): Promise<void> {
  const requiredTables: Record<KnownMigration, readonly string[]> = {
    [REFRESH_TOKEN_MIGRATION]: ["RefreshToken"],
    [ECONOMY_MIGRATION]: ["PowerUpBet", "GameSettlement", "GameWinnerReward"],
    [GUEST_LIFECYCLE_MIGRATION]: ["User", "Room"],
  };

  for (const tableName of requiredTables[migrationName]) {
    if (!(await tableExists(tableName))) {
      throw new Error(`Repair for ${migrationName} did not create table ${tableName}`);
    }
  }
}

async function main(): Promise<void> {
  if (!(await tableExists("User")) || !(await tableExists("Room"))) {
    console.log("Known migration repair skipped because the canonical schema is not present.");
    return;
  }

  const applied = await loadAppliedMigrations();
  const repairs: Array<readonly [KnownMigration, () => Promise<void>]> = [
    [REFRESH_TOKEN_MIGRATION, repairRefreshTokenMigration],
    [ECONOMY_MIGRATION, repairEconomyMigration],
    [GUEST_LIFECYCLE_MIGRATION, repairGuestLifecycleMigration],
  ];

  for (const [migrationName, repair] of repairs) {
    if (applied.has(migrationName)) continue;

    console.log(`Repairing known unapplied migration ${migrationName}...`);
    await repair();
    await verifyMigrationShape(migrationName);
    await prisma.$disconnect();
    resolveApplied(migrationName);
    await prisma.$connect();
    applied.add(migrationName);
    console.log(`Migration ${migrationName} repaired and marked applied.`);
  }

  if (repairs.every(([migrationName]) => applied.has(migrationName))) {
    console.log("Known post-baseline migration history is ready.");
  }
}

main()
  .catch(async (error: unknown) => {
    await prisma.$disconnect().catch(() => undefined);
    console.error(
      "Known migration repair failed:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
