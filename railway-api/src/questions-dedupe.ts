import { pool } from "./db.js";

async function main(): Promise<void> {
  const result = await pool.query(
    `WITH ranked AS (
       SELECT id,
              row_number() OVER (
                PARTITION BY lower(category), lower(prompt), lower("optionA"), lower("optionB"), lower("optionC"), lower("optionD"), "correctIndex"
                ORDER BY review_status = 'approved' DESC, "createdAt" ASC
              ) AS rn
       FROM "QuestionBank"
     )
     UPDATE "QuestionBank" q
     SET review_status = 'rejected', "isActive" = false, reviewed_at = now(), reviewed_by = 'dedupe'
     FROM ranked r
     WHERE q.id = r.id AND r.rn > 1
     RETURNING q.id`,
  );
  console.log(JSON.stringify({ ok: true, rejectedDuplicates: result.rowCount ?? 0, ids: result.rows.map((row) => row.id) }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
