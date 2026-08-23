ALTER TABLE "QuestionBank"
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'approved'
    CHECK (review_status IN ('approved', 'pending', 'rejected')),
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'import'
    CHECK (source IN ('import', 'generated', 'manual')),
  ADD COLUMN IF NOT EXISTS generated_at timestamp,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamp,
  ADD COLUMN IF NOT EXISTS reviewed_by text;

UPDATE "QuestionBank"
SET review_status = CASE WHEN "isActive" THEN 'approved' ELSE 'pending' END
WHERE review_status IS NULL;

CREATE INDEX IF NOT EXISTS questionbank_review_status_idx
  ON "QuestionBank"(review_status, "isActive", difficulty);
