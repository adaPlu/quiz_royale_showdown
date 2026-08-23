DO $$
BEGIN
  CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "QuestionBank" (
  id text PRIMARY KEY,
  prompt text NOT NULL,
  "optionA" text NOT NULL,
  "optionB" text NOT NULL,
  "optionC" text NOT NULL,
  "optionD" text NOT NULL,
  "correctIndex" integer NOT NULL CHECK ("correctIndex" BETWEEN 0 AND 3),
  category text NOT NULL,
  difficulty "Difficulty" NOT NULL,
  "lastUsedAt" timestamp,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS questionbank_active_difficulty_last_used_idx
  ON "QuestionBank"(difficulty, "isActive", "lastUsedAt", "createdAt");

CREATE INDEX IF NOT EXISTS questionbank_active_category_idx
  ON "QuestionBank"(category, difficulty)
  WHERE "isActive" = true;

DROP TABLE IF EXISTS question_usage_rollups;
DROP TABLE IF EXISTS question_usage_events;
DROP TABLE IF EXISTS question_generation_jobs;
DROP TABLE IF EXISTS questions CASCADE;
