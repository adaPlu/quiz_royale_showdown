CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "QuestionBank"
  ADD COLUMN IF NOT EXISTS content_hash text;

UPDATE "QuestionBank"
SET content_hash = encode(
  digest(
    '{"category":' ||
      to_jsonb(lower(regexp_replace(trim(category), '[[:space:]]+', ' ', 'g')))::text ||
      ',"difficulty":' ||
      to_jsonb(lower(regexp_replace(trim(difficulty::text), '[[:space:]]+', ' ', 'g')))::text ||
      ',"text":' ||
      to_jsonb(lower(regexp_replace(trim(prompt), '[[:space:]]+', ' ', 'g')))::text ||
      ',"options":[' ||
      to_jsonb(lower(regexp_replace(trim("optionA"), '[[:space:]]+', ' ', 'g')))::text || ',' ||
      to_jsonb(lower(regexp_replace(trim("optionB"), '[[:space:]]+', ' ', 'g')))::text || ',' ||
      to_jsonb(lower(regexp_replace(trim("optionC"), '[[:space:]]+', ' ', 'g')))::text || ',' ||
      to_jsonb(lower(regexp_replace(trim("optionD"), '[[:space:]]+', ' ', 'g')))::text ||
      '],"correct":' ||
      "correctIndex"::text ||
    '}',
    'sha256'
  ),
  'hex'
)
WHERE content_hash IS NULL;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY content_hash
           ORDER BY
             CASE review_status WHEN 'approved' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
             "createdAt",
             id
         ) AS rn
  FROM "QuestionBank"
  WHERE content_hash IS NOT NULL
)
UPDATE "QuestionBank" q
SET review_status = 'rejected',
    "isActive" = false,
    reviewed_at = COALESCE(reviewed_at, now()),
    reviewed_by = COALESCE(reviewed_by, 'content-hash-dedupe')
FROM ranked
WHERE q.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS questionbank_content_hash_active_unique_idx
  ON "QuestionBank"(content_hash)
  WHERE content_hash IS NOT NULL AND review_status <> 'rejected';
