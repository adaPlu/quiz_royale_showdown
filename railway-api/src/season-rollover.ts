import { pool, tx } from "./db.js";
import { defaultRewardTrack } from "./admin-data.js";

async function main(): Promise<void> {
  const now = Date.now();
  const seasonId = arg("--id") ?? `season-${new Date(now).toISOString().slice(0, 10)}`;
  const name = arg("--name") ?? "New Season";
  const days = Number.parseInt(arg("--days") ?? "90", 10);
  const endsAt = now + days * 24 * 60 * 60 * 1000;
  await tx(async (client) => {
    await client.query("UPDATE seasons SET active = false WHERE active = true");
    await client.query(
      `INSERT INTO seasons(season_id, name, starts_at, ends_at, reward_track, active, created_at)
       VALUES ($1, $2, $3, $4, $5, true, $3)
       ON CONFLICT (season_id)
       DO UPDATE SET name = EXCLUDED.name, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
                     reward_track = EXCLUDED.reward_track, active = true`,
      [seasonId, name, now, endsAt, JSON.stringify(defaultRewardTrack)],
    );
  });
  console.log(JSON.stringify({ ok: true, seasonId, name, startsAt: now, endsAt }));
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
