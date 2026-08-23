import type { DoEnv } from "./do-dispatch";
import type { GameMode } from "./protocol";

const ROOM_TICKET_TTL_MS = 30 * 60 * 1000;
const encoder = new TextEncoder();

export type RoomTicketClaims = {
  subjectKey: string;
  displayName: string;
  powerUpCharges: number;
};

export async function mintRoomTicket(
  env: DoEnv,
  roomId: string,
  mode: GameMode,
  subjectKey: string,
  claimsOrNow?: Pick<RoomTicketClaims, "displayName" | "powerUpCharges"> | number,
  now = Date.now(),
): Promise<string | null> {
  const secret = ticketSecret(env);
  if (!secret) return null;
  const claims = typeof claimsOrNow === "number" || claimsOrNow === undefined
    ? null
    : claimsOrNow;
  const issuedAt = typeof claimsOrNow === "number" ? claimsOrNow : now;

  const expiresAt = issuedAt + ROOM_TICKET_TTL_MS;
  const payload = claims
    ? `v2.${roomId}.${mode}.${encodeSegment(subjectKey)}.${encodeSegment(claims.displayName)}.${Math.max(0, Math.min(99, Math.trunc(claims.powerUpCharges)))}.${expiresAt}.${crypto.randomUUID()}`
    : `${roomId}.${mode}.${encodeSegment(subjectKey)}.${expiresAt}.${crypto.randomUUID()}`;
  const signature = await sign(secret, payload);
  return `${payload}.${signature}`;
}

export async function verifyRoomTicket(
  env: DoEnv,
  ticket: string | null,
  roomId: string,
  mode: GameMode,
  subjectKey: string,
  now = Date.now(),
): Promise<boolean> {
  const claims = await verifyRoomTicketClaims(env, ticket, roomId, mode, now);
  return claims?.subjectKey === subjectKey;
}

export async function verifyRoomTicketClaims(
  env: DoEnv,
  ticket: string | null,
  roomId: string,
  mode: GameMode,
  now = Date.now(),
): Promise<RoomTicketClaims | null> {
  const secret = ticketSecret(env);
  if (!secret || !ticket) return null;

  const parts = ticket.split(".");
  if (parts[0] === "v2") {
    if (parts.length !== 9) return null;
    const [, ticketRoomId, ticketMode, rawSubjectKey, rawDisplayName, rawPowerUps, rawExpiresAt] = parts;
    if (ticketRoomId !== roomId || ticketMode !== mode) return null;
    const expiresAt = Number.parseInt(rawExpiresAt ?? "", 10);
    if (!Number.isFinite(expiresAt) || expiresAt < now) return null;
    const payload = parts.slice(0, 8).join(".");
    const expected = await sign(secret, payload);
    if (!fixedWorkStringEqual(expected, parts[8] ?? "")) return null;
    return {
      subjectKey: decodeSegment(rawSubjectKey ?? ""),
      displayName: decodeSegment(rawDisplayName ?? ""),
      powerUpCharges: clampPowerUpCharges(Number.parseInt(rawPowerUps ?? "", 10)),
    };
  }

  if (parts.length !== 6) return null;
  const [ticketRoomId, ticketMode, rawSubjectKey, rawExpiresAt] = parts;
  if (ticketRoomId !== roomId || ticketMode !== mode) return null;

  const expiresAt = Number.parseInt(rawExpiresAt ?? "", 10);
  if (!Number.isFinite(expiresAt) || expiresAt < now) return null;

  const payload = parts.slice(0, 5).join(".");
  const expected = await sign(secret, payload);
  if (!fixedWorkStringEqual(expected, parts[5] ?? "")) return null;
  return {
    subjectKey: decodeSegment(rawSubjectKey ?? ""),
    displayName: "",
    powerUpCharges: 0,
  };
}

export async function roomTicketUseKey(ticket: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(ticket));
  return `room-ticket:${base64Url(digest)}`;
}

function ticketSecret(env: DoEnv): string | null {
  const explicit = env.MATCH_ROOM_TICKET_SECRET?.trim();
  if (explicit) return explicit;
  if (isProduction(env)) return null;
  return env.RAILWAY_INTERNAL_TOKEN?.trim() || null;
}

function isProduction(env: DoEnv): boolean {
  return [env.ENVIRONMENT, env.NODE_ENV, env.APP_ENV]
    .some((value) => value?.trim().toLowerCase() === "production");
}

function encodeSegment(value: string): string {
  let raw = "";
  for (const byte of encoder.encode(value)) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeSegment(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    const raw = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(raw, (char) => char.charCodeAt(0)));
  } catch {
    return "";
  }
}

function clampPowerUpCharges(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(99, Math.trunc(value)));
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64Url(signature);
}

function base64Url(buffer: ArrayBuffer): string {
  let raw = "";
  for (const byte of new Uint8Array(buffer)) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fixedWorkStringEqual(left: string, right: string): boolean {
  const max = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let index = 0; index < max; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
}
