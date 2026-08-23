import { pool } from "./db.js";

async function main(): Promise<void> {
  const result = await pool.query(
    `SELECT id, category, difficulty::text AS difficulty, prompt, source, generated_at
     FROM "QuestionBank"
     WHERE review_status = 'pending'
     ORDER BY generated_at NULLS LAST, "createdAt"
     LIMIT 100`,
  );
  console.log(JSON.stringify({ ok: true, questions: result.rows }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
