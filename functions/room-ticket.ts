import type { DoEnv } from "./do-dispatch";
import type { GameMode } from "./protocol";

const ROOM_TICKET_TTL_MS = 30 * 60 * 1000;
const encoder = new TextEncoder();

export async function mintRoomTicket(
  env: DoEnv,
  roomId: string,
  mode: GameMode,
  subjectKey: string,
  now = Date.now(),
): Promise<string | null> {
  const secret = ticketSecret(env);
  if (!secret) return null;

  const expiresAt = now + ROOM_TICKET_TTL_MS;
  const payload = `${roomId}.${mode}.${encodeSegment(subjectKey)}.${expiresAt}.${crypto.randomUUID()}`;
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
  const secret = ticketSecret(env);
  if (!secret || !ticket) return false;

  const parts = ticket.split(".");
  if (parts.length !== 6) return false;
  const [ticketRoomId, ticketMode, rawSubjectKey, rawExpiresAt] = parts;
  if (ticketRoomId !== roomId || ticketMode !== mode) return false;
  if (rawSubjectKey !== encodeSegment(subjectKey)) return false;

  const expiresAt = Number.parseInt(rawExpiresAt ?? "", 10);
  if (!Number.isFinite(expiresAt) || expiresAt < now) return false;

  const payload = parts.slice(0, 5).join(".");
  const expected = await sign(secret, payload);
  return fixedWorkStringEqual(expected, parts[5] ?? "");
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
