import {
  GOOGLE_PLAY_REVIEW_EMAIL,
  GOOGLE_PLAY_REVIEW_ROLE,
  REVIEW_ACCOUNT_BALANCE,
  normalizeCurrencyBalances,
  normalizeEntitlements,
} from "./identity.js";
import { pool } from "./db.js";

async function main(): Promise<void> {
  const required = ["DATABASE_URL", "REDIS_URL", "INTERNAL_API_TOKEN", "GOOGLE_PLAY_REVIEW_PASSWORD"];
  const missing = required.filter((key) => !process.env[key]?.trim());
  const [
    migration009,
    migration010,
    catalog,
    reviewer,
    questionBank,
    railwayHealth,
    workerHealth,
  ] = await Promise.all([
    migrationApplied("009_questionbank_content_hash.sql"),
    migrationApplied("010_default_commerce_catalog.sql"),
    catalogStatus(),
    reviewerStatus(),
    questionBankStatus(),
    healthStatus("RAILWAY_PUBLIC_URL", "/health"),
    workerHealthStatus("WORKER_PUBLIC_URL", "/health"),
  ]);
  const checks = {
    env: { ok: missing.length === 0, missing },
    migration009,
    migration010,
    catalog,
    reviewer,
    questionBank,
    railwayHealth,
    workerHealth,
  };
  const ok = Object.values(checks).every((check) => check.ok);
  console.log(JSON.stringify({ ok, checks }));
  if (!ok) process.exitCode = 1;
}

async function migrationApplied(id: string): Promise<{ ok: boolean; id: string; applied: boolean }> {
  if (!await tableExists("schema_migrations")) return { ok: false, id, applied: false };
  const result = await pool.query("SELECT 1 FROM schema_migrations WHERE id = $1", [id]);
  return { ok: result.rowCount === 1, id, applied: result.rowCount === 1 };
}

async function catalogStatus(): Promise<{
  ok: boolean;
  powerups: number;
  cosmeticOffers: number;
  cosmetics: number;
  seasonPass: number;
  activeSeason: number;
}> {
  const [powerups, cosmeticOffers, cosmetics, seasonPass, activeSeason] = await Promise.all([
    count("store_items", "active = true AND item_type = 'POWERUP_CHARGE'"),
    count("store_items", "active = true AND item_type = 'COSMETIC'"),
    count("cosmetic_items", "active = true"),
    count("store_items", "active = true AND item_type = 'SEASON_PASS'"),
    count("seasons", "active = true AND starts_at <= $1 AND ends_at > $1", [Date.now()]),
  ]);
  return {
    ok: powerups >= 3 && cosmeticOffers >= 6 && cosmetics >= 8 && seasonPass >= 1 && activeSeason === 1,
    powerups,
    cosmeticOffers,
    cosmetics,
    seasonPass,
    activeSeason,
  };
}

async function reviewerStatus(): Promise<{
  ok: boolean;
  exists: boolean;
  email: string;
  role: string | null;
  entitlements: Record<string, boolean> | null;
  balancesOk: boolean;
}> {
  const reviewerEmail = (process.env.GOOGLE_PLAY_REVIEW_EMAIL ?? GOOGLE_PLAY_REVIEW_EMAIL).trim().toLowerCase();
  const reviewer = await pool.query<{
    role: string;
    entitlements: unknown;
    currency_balances: unknown;
  }>(
    "SELECT role, entitlements, currency_balances FROM users WHERE email = $1",
    [reviewerEmail],
  );
  const row = reviewer.rows[0];
  if (!row) return { ok: false, exists: false, email: reviewerEmail, role: null, entitlements: null, balancesOk: false };

  const entitlements = normalizeEntitlements(row.entitlements);
  const balances = normalizeCurrencyBalances(row.currency_balances);
  const entitlementsOk = entitlements.isReviewer &&
    entitlements.unlimitedCurrency &&
    entitlements.allStoreItemsUnlocked &&
    entitlements.premiumAccess &&
    entitlements.seasonPassAccess;
  const balancesOk = balances.coins >= REVIEW_ACCOUNT_BALANCE &&
    balances.gems >= REVIEW_ACCOUNT_BALANCE &&
    balances.seasonalTickets >= REVIEW_ACCOUNT_BALANCE;
  return {
    ok: row.role === GOOGLE_PLAY_REVIEW_ROLE && entitlementsOk && balancesOk,
    exists: true,
    email: reviewerEmail,
    role: row.role,
    entitlements,
    balancesOk,
  };
}

async function questionBankStatus(): Promise<{ ok: boolean; approvedActive: number; pending: number; duplicates: number }> {
  if (!await tableExists("QuestionBank")) return { ok: false, approvedActive: 0, pending: 0, duplicates: 0 };
  if (!await columnExists("QuestionBank", "content_hash")) return { ok: false, approvedActive: 0, pending: 0, duplicates: 0 };
  const [approvedActive, pending, duplicates] = await Promise.all([
    count("\"QuestionBank\"", "\"isActive\" = true AND review_status = 'approved'"),
    count("\"QuestionBank\"", "review_status = 'pending'"),
    questionBankDuplicateCount(),
  ]);
  return { ok: approvedActive >= 100 && duplicates === 0, approvedActive, pending, duplicates };
}

async function questionBankDuplicateCount(): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM (
       SELECT content_hash
       FROM "QuestionBank"
       WHERE content_hash IS NOT NULL AND review_status <> 'rejected'
       GROUP BY content_hash
       HAVING count(*) > 1
     ) dupes`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function healthStatus(envKey: string, path: string): Promise<{ ok: boolean; configured: boolean; status: number | null }> {
  const base = process.env[envKey]?.trim();
  if (!base) return { ok: false, configured: false, status: null };
  const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return { ok: response.ok, configured: true, status: response.status };
  } catch {
    return { ok: false, configured: true, status: null };
  } finally {
    clearTimeout(timeout);
  }
}

async function workerHealthStatus(envKey: string, path: string): Promise<{
  ok: boolean;
  configured: boolean;
  status: number | null;
  matchRoomTickets: boolean | null;
}> {
  const base = process.env[envKey]?.trim();
  if (!base) return { ok: false, configured: false, status: null, matchRoomTickets: null };
  const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const body = await response.json().catch(() => null) as { configuration?: { matchRoomTickets?: unknown } } | null;
    const matchRoomTickets = body?.configuration?.matchRoomTickets === true;
    return {
      ok: response.ok && matchRoomTickets,
      configured: true,
      status: response.status,
      matchRoomTickets,
    };
  } catch {
    return { ok: false, configured: true, status: null, matchRoomTickets: null };
  } finally {
    clearTimeout(timeout);
  }
}

async function tableExists(table: string): Promise<boolean> {
  const quoted = /^[a-z_][a-z0-9_]*$/.test(table) ? table : `"${table.replaceAll("\"", "\"\"")}"`;
  const result = await pool.query<{ exists: boolean }>("SELECT to_regclass($1) IS NOT NULL AS exists", [`public.${quoted}`]);
  return result.rows[0]?.exists === true;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS exists`,
    [table, column],
  );
  return result.rows[0]?.exists === true;
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
