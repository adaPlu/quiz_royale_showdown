import { pool } from "./db.js";
import { defaultRewardTrack } from "./admin-data.js";

async function main(): Promise<void> {
  const now = Date.now();
  const seasonId = arg("--id") ?? `season-${new Date(now).toISOString().slice(0, 10)}`;
  const name = arg("--name") ?? "Active Season";
  const days = Number.parseInt(arg("--days") ?? "90", 10);
  const startsAt = Number.parseInt(arg("--starts-at") ?? String(now), 10);
  const endsAt = Number.parseInt(arg("--ends-at") ?? String(startsAt + days * 24 * 60 * 60 * 1000), 10);

  await pool.query(
    `INSERT INTO seasons(season_id, name, starts_at, ends_at, reward_track, active, created_at)
     VALUES ($1, $2, $3, $4, $5, true, $6)
     ON CONFLICT (season_id)
     DO UPDATE SET name = EXCLUDED.name, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
                   reward_track = EXCLUDED.reward_track, active = true`,
    [seasonId, name, startsAt, endsAt, JSON.stringify(defaultRewardTrack), now],
  );
  console.log(JSON.stringify({ ok: true, seasonId, name, startsAt, endsAt }));
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
