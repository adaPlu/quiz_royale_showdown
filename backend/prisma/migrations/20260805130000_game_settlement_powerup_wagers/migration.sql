-- CreateEnum
CREATE TYPE "PowerUpBetStatus" AS ENUM ('PLACED', 'WON', 'LOST', 'REFUNDED');

-- CreateTable
CREATE TABLE "PowerUpBet" (
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
);

-- CreateTable
CREATE TABLE "GameSettlement" (
    "id" VARCHAR(26) NOT NULL,
    "roomId" VARCHAR(26) NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameWinnerReward" (
    "id" VARCHAR(26) NOT NULL,
    "roomId" VARCHAR(26) NOT NULL,
    "userId" VARCHAR(26) NOT NULL,
    "powerUpId" VARCHAR(26) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameWinnerReward_pkey" PRIMARY KEY ("id")
);

-- Existing-table performance indexes. Historical data constraints are not
-- added here unless they can be validated before production migration.
CREATE INDEX "RefreshToken_userId_expiresAt_idx" ON "RefreshToken"("userId", "expiresAt");
CREATE INDEX "Room_status_createdAt_idx" ON "Room"("status", "createdAt");
CREATE INDEX "Room_hostUserId_idx" ON "Room"("hostUserId");
CREATE INDEX "QuestionBank_isActive_difficulty_lastUsedAt_idx" ON "QuestionBank"("isActive", "difficulty", "lastUsedAt");
CREATE INDEX "XpEvent_userId_createdAt_idx" ON "XpEvent"("userId", "createdAt");
CREATE INDEX "Season_startsAt_endsAt_idx" ON "Season"("startsAt", "endsAt");

-- New-model integrity and lookup indexes
CREATE UNIQUE INDEX "PowerUpBet_roundId_userId_key" ON "PowerUpBet"("roundId", "userId");
CREATE INDEX "PowerUpBet_roomId_status_idx" ON "PowerUpBet"("roomId", "status");
CREATE UNIQUE INDEX "GameSettlement_roomId_key" ON "GameSettlement"("roomId");
CREATE UNIQUE INDEX "GameWinnerReward_roomId_userId_key" ON "GameWinnerReward"("roomId", "userId");
CREATE INDEX "GameWinnerReward_userId_createdAt_idx" ON "GameWinnerReward"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "PowerUpBet" ADD CONSTRAINT "PowerUpBet_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PowerUpBet" ADD CONSTRAINT "PowerUpBet_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PowerUpBet" ADD CONSTRAINT "PowerUpBet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PowerUpBet" ADD CONSTRAINT "PowerUpBet_powerUpId_fkey" FOREIGN KEY ("powerUpId") REFERENCES "PowerUp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameSettlement" ADD CONSTRAINT "GameSettlement_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameWinnerReward" ADD CONSTRAINT "GameWinnerReward_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameWinnerReward" ADD CONSTRAINT "GameWinnerReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameWinnerReward" ADD CONSTRAINT "GameWinnerReward_powerUpId_fkey" FOREIGN KEY ("powerUpId") REFERENCES "PowerUp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
