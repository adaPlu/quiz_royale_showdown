// functions/matchmaker.ts — one singleton instance per game mode.
//
// Plain HTTP (no WebSocket): the client asks for a room id, then opens its
// match socket straight to that room. Keeping matchmaking off the socket path
// means a player never sits in a queue — they are placed into an open lobby
// immediately and the room itself runs the countdown.

import { DurableObject } from "cloudflare:workers";
import { callDo, type DoEnv } from "./do-dispatch";
import { MODE_CONFIG, type GameMode } from "./protocol";
import { enforceRateLimit, type RateLimitOptions } from "./rate-limit";

type Bucket = {
  roomId: string;
  playerCount: number;
  openedAt: number;
  reservations?: number[];
};

type RoomStatus = {
  phase: string;
  humanPlayers: number;
  maxPlayers: number | null;
};

const BUCKET_KEY = "open-bucket";
const MATCHMAKE_RATE_LIMIT: RateLimitOptions = { max: 60, windowMs: 60_000 };
const PRACTICE_RATE_LIMIT: RateLimitOptions = { max: 30, windowMs: 60_000 };
const RESERVATION_TTL_MS = 8_000;

export class Matchmaker extends DurableObject<DoEnv> {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const mode = parseMode(this.ctx.id.name ?? url.searchParams.get("mode"));
    const cfg = MODE_CONFIG[mode];
    const limited = await enforceRateLimit(
      this.ctx,
      request,
      `matchmake:${mode}`,
      mode === "PRACTICE" ? PRACTICE_RATE_LIMIT : MATCHMAKE_RATE_LIMIT,
    );
    if (limited) return limited;

    const bucket = await this.ctx.storage.get<Bucket>(BUCKET_KEY);
    const status = bucket ? await this.roomStatus(bucket.roomId) : null;
    const now = Date.now();

    if (mode === "PRACTICE") {
      const roomId = `practice-${crypto.randomUUID()}-${now.toString(36)}`;
      return Response.json({
        roomId,
        mode,
        playersWaiting: 1,
        lobbyEndsAt: now + cfg.lobbyMs,
      });
    }

    // A lobby stops accepting players once it is full or once its countdown
    // has run out — otherwise a late joiner would drop into a live match.
    const activeReservations = bucket?.reservations?.filter((reservedAt) => now - reservedAt <= RESERVATION_TTL_MS) ?? [];
    const reservedOrJoined = Math.max(status?.humanPlayers ?? 0, activeReservations.length);
    const expired =
      !bucket ||
      status?.phase !== "LOBBY" ||
      reservedOrJoined >= cfg.maxPlayers ||
      now - bucket.openedAt > cfg.lobbyMs - 2_500;

    const nextReservations = expired ? [now] : [...activeReservations, now];
    const next: Bucket = expired
      ? {
          roomId: `${mode.toLowerCase()}-${now.toString(36)}-${crypto.randomUUID().slice(0, 6)}`,
          playerCount: 1,
          openedAt: now,
          reservations: nextReservations,
        }
      : {
          ...bucket,
          reservations: nextReservations,
          playerCount: Math.min(cfg.maxPlayers, Math.max(status?.humanPlayers ?? 0, nextReservations.length)),
        };

    await this.ctx.storage.put(BUCKET_KEY, next);

    return Response.json({
      roomId: next.roomId,
      mode,
      playersWaiting: next.playerCount,
      lobbyEndsAt: next.openedAt + cfg.lobbyMs,
    });
  }

  private async roomStatus(roomId: string): Promise<RoomStatus | null> {
    const response = await callDo(this.env, "MatchRoom", roomId, "/internal/status").catch(() => null);
    if (!response?.ok) return null;
    return await response.json<RoomStatus>().catch(() => null);
  }
}

function parseMode(raw: string | null): GameMode {
  if (raw === "TOURNAMENT" || raw === "PRACTICE" || raw === "QUICK") return raw;
  return "QUICK";
}
