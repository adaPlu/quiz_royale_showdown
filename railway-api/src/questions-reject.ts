import { pool } from "./db.js";

async function main(): Promise<void> {
  const id = arg("--id");
  if (!id) throw new Error("--id is required");
  const reviewer = arg("--reviewed-by") ?? "cli";
  const result = await pool.query(
    `UPDATE "QuestionBank"
     SET review_status = 'rejected', "isActive" = false, reviewed_at = now(), reviewed_by = $2
     WHERE id = $1
     RETURNING id`,
    [id, reviewer],
  );
  console.log(JSON.stringify({ ok: result.rowCount === 1, id }));
}

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
