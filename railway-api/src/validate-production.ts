import { GOOGLE_PLAY_REVIEW_EMAIL } from "./identity.js";
import { pool } from "./db.js";

async function main(): Promise<void> {
  const required = ["DATABASE_URL", "REDIS_URL", "INTERNAL_API_TOKEN", "GOOGLE_PLAY_REVIEW_PASSWORD", "MATCH_ROOM_TICKET_SECRET"];
  const missing = required.filter((key) => !process.env[key]?.trim());
  const reviewer = await pool.query<{ role: string }>("SELECT role FROM users WHERE email = $1", [GOOGLE_PLAY_REVIEW_EMAIL]);
  const hasReviewer = Boolean(reviewer.rows[0]);
  const ok = missing.length === 0 && hasReviewer;
  console.log(JSON.stringify({ ok, missing, reviewer: hasReviewer ? reviewer.rows[0] : null }));
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
