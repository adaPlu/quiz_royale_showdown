import { pool } from "./db.js";

async function main(): Promise<void> {
  const [powerups, cosmetics, seasonPass, activeSeason] = await Promise.all([
    count("store_items", "active = true AND item_type = 'POWERUP_CHARGE'"),
    count("cosmetic_items", "active = true"),
    count("store_items", "active = true AND item_type = 'SEASON_PASS'"),
    count("seasons", "active = true AND starts_at <= $1 AND ends_at > $1", [Date.now()]),
  ]);
  const ok = powerups >= 3 && cosmetics >= 8 && seasonPass >= 1 && activeSeason === 1;
  console.log(JSON.stringify({ ok, powerups, cosmetics, seasonPass, activeSeason }));
  if (!ok) process.exitCode = 1;
}

async function count(table: string, where: string, params: unknown[] = []): Promise<number> {
  const result = await pool.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table} WHERE ${where}`, params);
  return Number(result.rows[0]?.count ?? 0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
