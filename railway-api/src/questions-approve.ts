import { pool } from "./db.js";
import { DIFFICULTIES, normalizeText } from "./questions.js";

async function main(): Promise<void> {
  const id = arg("--id");
  if (!id) throw new Error("--id is required");
  const reviewer = arg("--reviewed-by") ?? "cli";
  const row = await pool.query<{
    id: string;
    prompt: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    correctIndex: number;
    difficulty: string;
  }>(
    `SELECT id, prompt, "optionA", "optionB", "optionC", "optionD", "correctIndex", difficulty::text AS difficulty
     FROM "QuestionBank"
     WHERE id = $1`,
    [id],
  );
  const question = row.rows[0];
  if (!question) {
    console.log(JSON.stringify({ ok: false, id, error: "not_found" }));
    return;
  }
  const validationError = approvalValidationError(question);
  if (validationError) {
    console.log(JSON.stringify({ ok: false, id, error: validationError }));
    process.exitCode = 1;
    return;
  }

  const result = await pool.query(
    `UPDATE "QuestionBank"
     SET review_status = 'approved', "isActive" = true, reviewed_at = now(), reviewed_by = $2
     WHERE id = $1
     RETURNING id`,
    [id, reviewer],
  );
  console.log(JSON.stringify({ ok: result.rowCount === 1, id }));
}

function approvalValidationError(row: {
  prompt: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctIndex: number;
  difficulty: string;
}): string | null {
  const difficulty = row.difficulty.toLowerCase();
  if (!DIFFICULTIES.includes(difficulty as typeof DIFFICULTIES[number])) return "invalid_difficulty";
  if (normalizeText(row.prompt).length < 8) return "invalid_prompt";
  const options = [row.optionA, row.optionB, row.optionC, row.optionD].map(normalizeText);
  if (options.some((option) => option.length === 0)) return "invalid_options";
  if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) return "duplicate_options";
  const correct = Number(row.correctIndex);
  if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) return "invalid_correct_index";
  return null;
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
