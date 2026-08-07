ALTER TABLE "User"
  ADD COLUMN "isGuest" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "User"
SET
  "isGuest" = true,
  "expiresAt" = COALESCE("expiresAt", "createdAt" + INTERVAL '24 hours')
WHERE "email" LIKE '%@guest.quizroyale.invalid';

CREATE INDEX "User_isGuest_expiresAt_idx" ON "User"("isGuest", "expiresAt");

ALTER TABLE "Room"
  ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "maxPlayers" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN "autoStartSolo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "gameDifficulty" VARCHAR(10) NOT NULL DEFAULT 'medium';

ALTER TABLE "Room"
  ADD CONSTRAINT "Room_maxPlayers_check" CHECK ("maxPlayers" BETWEEN 2 AND 100),
  ADD CONSTRAINT "Room_gameDifficulty_check" CHECK ("gameDifficulty" IN ('easy', 'medium', 'hard'));
