from pathlib import Path

path = Path("backend/src/scripts/validateMigrationUpgrade.ts")
text = path.read_text(encoding="utf-8")

anchor = '''async function verifyKnownBaselineHistory(prisma: PrismaClient): Promise<void> {'''
function = '''async function simulatePartialPostBaselineHistory(
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

'''
if anchor not in text:
    raise SystemExit("verifyKnownBaselineHistory anchor not found")
text = text.replace(anchor, function + anchor, 1)

old = '''    await seedRepresentativeExistingData(prisma);
    await simulateFailedLegacyHistory(prisma, prismaDir);
    await prisma.$disconnect();

    run("npx", ["tsx", "src/scripts/reconcileLegacyMigrations.ts"]);
    run("npx", ["prisma", "migrate", "deploy"]);'''
new = '''    await seedRepresentativeExistingData(prisma);
    await simulateFailedLegacyHistory(prisma, prismaDir);
    await simulatePartialPostBaselineHistory(prisma, prismaDir);
    await prisma.$disconnect();

    run("npx", ["tsx", "src/scripts/reconcileLegacyMigrations.ts"]);
    run("npx", ["tsx", "src/scripts/repairKnownMigrations.ts"]);
    run("npx", ["prisma", "migrate", "deploy"]);'''
if old not in text:
    raise SystemExit("legacy recovery invocation pattern not found")
text = text.replace(old, new, 1)

old = '''    // Recovery and later migrations must also be idempotent.
    run("npx", ["tsx", "src/scripts/reconcileLegacyMigrations.ts"]);
    run("npx", ["prisma", "migrate", "deploy"]);'''
new = '''    // Recovery and later migrations must also be idempotent.
    run("npx", ["tsx", "src/scripts/reconcileLegacyMigrations.ts"]);
    run("npx", ["tsx", "src/scripts/repairKnownMigrations.ts"]);
    run("npx", ["prisma", "migrate", "deploy"]);'''
if old not in text:
    raise SystemExit("idempotent recovery pattern not found")
text = text.replace(old, new, 1)

old = '''    run("npx", ["tsx", "src/scripts/reconcileLegacyMigrations.ts"]);
    run("npx", ["prisma", "migrate", "deploy"]);

    prisma = new PrismaClient();
    await verifyFreshDatabase(prisma);'''
new = '''    run("npx", ["tsx", "src/scripts/reconcileLegacyMigrations.ts"]);
    run("npx", ["tsx", "src/scripts/repairKnownMigrations.ts"]);
    run("npx", ["prisma", "migrate", "deploy"]);

    prisma = new PrismaClient();
    await verifyFreshDatabase(prisma);'''
if old not in text:
    raise SystemExit("fresh bootstrap pattern not found")
text = text.replace(old, new, 1)

text = text.replace(
    '"Migration upgrade, legacy recovery, and fresh-bootstrap rehearsals passed.",',
    '"Migration upgrade, partial-history repair, legacy recovery, and fresh-bootstrap rehearsals passed.",',
    1,
)

path.write_text(text, encoding="utf-8")
