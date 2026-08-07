ALTER TABLE "User"
  ADD COLUMN "isGuest" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "User"
SET
  "isGuest" = true,
  "expiresAt" = COALESCE("expiresAt", "createdAt" + INTERVAL '24 hours')
WHERE "email" LIKE '%@guest.quizroyale.invalid';

CREATE INDEX "User_isGuest_expiresAt_idx" ON "User"("isGuest", "expiresAt");
