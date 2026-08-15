-- Season pass: progression, entitlement, and an append-only claim ledger.
-- Also converts PurchaseReceipt.status from a bare TEXT column to an enum.
--
-- DDL below was generated from `prisma migrate diff --from-empty
-- --to-schema-datamodel` and transcribed, so table/column/index names match
-- exactly what Prisma expects. Statements use IF NOT EXISTS so the file is safe
-- to re-apply where an object was created out of band.

-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SeasonPassTrack') THEN
    CREATE TYPE "SeasonPassTrack" AS ENUM ('FREE', 'PREMIUM');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SeasonPassEntitlement') THEN
    CREATE TYPE "SeasonPassEntitlement" AS ENUM ('NONE', 'ACTIVE', 'REVOKED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PurchaseStatus') THEN
    CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'VALIDATED', 'REFUNDED', 'REVOKED');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SeasonPass" (
    "id" VARCHAR(26) NOT NULL,
    "seasonId" VARCHAR(26) NOT NULL,
    "premiumSku" TEXT NOT NULL,
    "tierCount" INTEGER NOT NULL,
    "xpPerTier" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeasonPass_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SeasonPassTier" (
    "id" VARCHAR(26) NOT NULL,
    "seasonPassId" VARCHAR(26) NOT NULL,
    "tier" INTEGER NOT NULL,
    "track" "SeasonPassTrack" NOT NULL,
    "cosmeticId" VARCHAR(26),
    "powerUpId" VARCHAR(26),
    "powerUpQuantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SeasonPassTier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserSeasonPass" (
    "id" VARCHAR(26) NOT NULL,
    "seasonPassId" VARCHAR(26) NOT NULL,
    "userId" VARCHAR(26) NOT NULL,
    "entitlement" "SeasonPassEntitlement" NOT NULL DEFAULT 'NONE',
    "premiumReceiptId" VARCHAR(26),
    "earnedXp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSeasonPass_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserSeasonPassClaim" (
    "id" VARCHAR(26) NOT NULL,
    "userSeasonPassId" VARCHAR(26) NOT NULL,
    "tierId" VARCHAR(26) NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSeasonPassClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SeasonPass_seasonId_key" ON "SeasonPass"("seasonId");
CREATE INDEX IF NOT EXISTS "SeasonPassTier_seasonPassId_tier_idx" ON "SeasonPassTier"("seasonPassId", "tier");
CREATE UNIQUE INDEX IF NOT EXISTS "SeasonPassTier_seasonPassId_tier_track_key" ON "SeasonPassTier"("seasonPassId", "tier", "track");
CREATE INDEX IF NOT EXISTS "UserSeasonPass_userId_idx" ON "UserSeasonPass"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "UserSeasonPass_seasonPassId_userId_key" ON "UserSeasonPass"("seasonPassId", "userId");
CREATE INDEX IF NOT EXISTS "UserSeasonPassClaim_userSeasonPassId_idx" ON "UserSeasonPassClaim"("userSeasonPassId");
CREATE UNIQUE INDEX IF NOT EXISTS "UserSeasonPassClaim_userSeasonPassId_tierId_key" ON "UserSeasonPassClaim"("userSeasonPassId", "tierId");

-- AddForeignKey
ALTER TABLE "SeasonPass" DROP CONSTRAINT IF EXISTS "SeasonPass_seasonId_fkey";
ALTER TABLE "SeasonPass" ADD CONSTRAINT "SeasonPass_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SeasonPassTier" DROP CONSTRAINT IF EXISTS "SeasonPassTier_seasonPassId_fkey";
ALTER TABLE "SeasonPassTier" ADD CONSTRAINT "SeasonPassTier_seasonPassId_fkey" FOREIGN KEY ("seasonPassId") REFERENCES "SeasonPass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeasonPassTier" DROP CONSTRAINT IF EXISTS "SeasonPassTier_cosmeticId_fkey";
ALTER TABLE "SeasonPassTier" ADD CONSTRAINT "SeasonPassTier_cosmeticId_fkey" FOREIGN KEY ("cosmeticId") REFERENCES "Cosmetic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SeasonPassTier" DROP CONSTRAINT IF EXISTS "SeasonPassTier_powerUpId_fkey";
ALTER TABLE "SeasonPassTier" ADD CONSTRAINT "SeasonPassTier_powerUpId_fkey" FOREIGN KEY ("powerUpId") REFERENCES "PowerUp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserSeasonPass" DROP CONSTRAINT IF EXISTS "UserSeasonPass_seasonPassId_fkey";
ALTER TABLE "UserSeasonPass" ADD CONSTRAINT "UserSeasonPass_seasonPassId_fkey" FOREIGN KEY ("seasonPassId") REFERENCES "SeasonPass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSeasonPass" DROP CONSTRAINT IF EXISTS "UserSeasonPass_userId_fkey";
ALTER TABLE "UserSeasonPass" ADD CONSTRAINT "UserSeasonPass_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSeasonPass" DROP CONSTRAINT IF EXISTS "UserSeasonPass_premiumReceiptId_fkey";
ALTER TABLE "UserSeasonPass" ADD CONSTRAINT "UserSeasonPass_premiumReceiptId_fkey" FOREIGN KEY ("premiumReceiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserSeasonPassClaim" DROP CONSTRAINT IF EXISTS "UserSeasonPassClaim_userSeasonPassId_fkey";
ALTER TABLE "UserSeasonPassClaim" ADD CONSTRAINT "UserSeasonPassClaim_userSeasonPassId_fkey" FOREIGN KEY ("userSeasonPassId") REFERENCES "UserSeasonPass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSeasonPassClaim" DROP CONSTRAINT IF EXISTS "UserSeasonPassClaim_tierId_fkey";
ALTER TABLE "UserSeasonPassClaim" ADD CONSTRAINT "UserSeasonPassClaim_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "SeasonPassTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A tier must grant exactly one kind of reward. Prisma cannot express CHECK
-- constraints, so this lives only in SQL — matching the existing
-- Room_maxPlayers_check precedent. Note for future `prisma migrate dev` runs:
-- this will not be regenerated from schema.prisma and must be preserved.
ALTER TABLE "SeasonPassTier" DROP CONSTRAINT IF EXISTS "SeasonPassTier_single_reward_check";
ALTER TABLE "SeasonPassTier" ADD CONSTRAINT "SeasonPassTier_single_reward_check"
  CHECK (("cosmeticId" IS NOT NULL AND "powerUpId" IS NULL)
      OR ("cosmeticId" IS NULL AND "powerUpId" IS NOT NULL AND "powerUpQuantity" > 0));

-- AlterTable: PurchaseReceipt.status TEXT -> PurchaseStatus.
-- No application code writes this column (verified by grep across backend/src),
-- so there are no app-authored rows to migrate. The USING clause still maps any
-- pre-existing values defensively rather than failing the migration.
ALTER TABLE "PurchaseReceipt"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "PurchaseStatus"
    USING (CASE upper("status")
             WHEN 'VALIDATED' THEN 'VALIDATED'
             WHEN 'REFUNDED'  THEN 'REFUNDED'
             WHEN 'REVOKED'   THEN 'REVOKED'
             ELSE 'PENDING'
           END)::"PurchaseStatus",
  ALTER COLUMN "status" SET DEFAULT 'PENDING';
