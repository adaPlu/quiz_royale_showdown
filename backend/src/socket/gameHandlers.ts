/**
 * gameHandlers.ts — registers all client→server WS event handlers on a
 * connected socket and wires RoomService, GameOrchestrator, and PowerUpService.
 *
 * WsEnvelope contract:
 *   { eventType, roomId, senderId, ts, payload }
 *
 * Client→Server events handled:
 *   v1:player:ready    — player signals they are ready; host auto-starts game when all are ready
 *   v1:player:answer   — submit an answer for the active round
 *   v1:powerup:use     — activate a power-up
 *   v1:chat:send       — relay a chat message to the room
 */

import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { roomService } from "../services/RoomService";
import { gameOrchestrator } from "../services/GameOrchestrator";
import { powerUpService, POWERUP_CODES } from "../services/PowerUpService";
import { redisService } from "../services/RedisService";
import { prisma } from "../models/prismaClient";
import { logger } from "../utils/logger";

// ─── Envelope schema helpers ──────────────────────────────────────────────────

/**
 * Wrap a Zod payload schema in the WsEnvelope frame and return the full schema.
 * The senderId is always overridden from `socket.data.userId` (never trusted from client).
 */
function envelopeSchema<T extends z.ZodTypeAny>(payloadSchema: T) {
  return z.object({
    eventType: z.string(),
    roomId: z.string().min(1),
    senderId: z.string().optional(), // overridden server-side
    ts: z.number().int().positive().optional(),
    payload: payloadSchema,
  });
}

// ─── Per-event payload schemas ────────────────────────────────────────────────

const playerReadySchema = envelopeSchema(z.object({}));

const playerAnswerSchema = envelopeSchema(
  z.object({
    roundId: z.string().min(1),
    answerIndex: z.number().int().min(0).max(3),
    clientTs: z.number().int().positive(),
    questionStartTs: z.number().int().positive(),
    timeLimitMs: z.number().int().positive(),
  })
);

const powerupUseSchema = envelopeSchema(
  z.object({
    powerupCode: z.enum(POWERUP_CODES),
    roundId: z.string().optional(),
  })
);

const chatSendSchema = envelopeSchema(
  z.object({
    message: z.string().min(1).max(256),
  })
);

// ─── Constants ────────────────────────────────────────────────────────────────

const ANSWER_LOCK_TTL_SECONDS = 3600;
const READY_TTL_SECONDS = 3600;
const CHAT_RATE_LIMIT_WINDOW_MS = 3_000;
const CHAT_MAX_IN_WINDOW = 5;

// ─── Utility ──────────────────────────────────────────────────────────────────

function emitError(
  socket: Socket,
  code: string,
  message: string,
  roomId?: string
): void {
  socket.emit("v1:error", {
    eventType: "v1:error",
    roomId: roomId ?? "",
    senderId: "server",
    ts: Date.now(),
    payload: { code, message },
  });
}

function scoreFromLatency(latencyMs: number, timeLimitMs: number): number {
  // 1000 base, speed-weighted with 400-point max penalty (matches ScoringEngine spirit)
  return Math.max(0, 1000 - Math.floor((latencyMs / timeLimitMs) * 400));
}

// ─── Handler registration ─────────────────────────────────────────────────────

/**
 * Register all client→server game event handlers on `socket`.
 * Call this once per connection inside `io.on("connection", ...)`.
 */
export function registerGameHandlers(io: Server, socket: Socket): void {
  const userId = socket.data.userId as string;

  // ── v1:player:ready ──────────────────────────────────────────────────────

  socket.on("v1:player:ready", async (raw: unknown) => {
    const parsed = playerReadySchema.safeParse(raw);
    if (!parsed.success) {
      emitError(socket, "VALIDATION_ERROR", "Invalid payload for v1:player:ready");
      return;
    }

    const { roomId } = parsed.data;

    try {
      if (!redisService) throw new Error("Redis unavailable");

      // Mark this player ready
      const readyKey = `room:${roomId}:player:${userId}:ready`;
      await redisService.set(readyKey, "true", READY_TTL_SECONDS);

      // Join the Socket.IO room channel
      await socket.join(roomId);

      // Load room + players
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
          players: { include: { user: { select: { id: true, displayName: true } } } },
        },
      });

      if (!room) {
        emitError(socket, "ROOM_NOT_FOUND", `Room ${roomId} not found`, roomId);
        return;
      }

      const activePlayers = room.players.filter((p) => !p.isEliminated);

      // Check if all active players are ready
      const readyChecks = await Promise.all(
        activePlayers.map(async (p) => {
          const val = await redisService!.get(`room:${roomId}:player:${p.userId}:ready`);
          return val === "true";
        })
      );
      const allReady = activePlayers.length >= 2 && readyChecks.every(Boolean);

      // Build player list for state emit
      const scoreEntries = await redisService.zrevrangeWithScores(`room:${roomId}:scores`, 0, -1);
      const scoreMap = Object.fromEntries(
        scoreEntries.map(({ member, score }) => [member, score])
      );
      const players = activePlayers.map((p) => ({
        id: p.userId,
        displayName: p.user.displayName,
        score: scoreMap[p.userId] ?? p.score,
        streak: p.streak,
        isEliminated: p.isEliminated,
      }));

      // Broadcast updated room state
      io.to(roomId).emit("v1:room:state", {
        eventType: "v1:room:state",
        roomId,
        senderId: "server",
        ts: Date.now(),
        payload: {
          phase: room.status,
          players,
          roundNumber: room.currentRound,
          totalRounds: room.totalRounds,
        },
      });

      logger.info("Player ready", { userId, roomId, allReady });

      // Kick off game when all players are ready
      if (allReady && room.status === "WAITING") {
        // Transition room to COUNTDOWN in DB
        await prisma.room.update({
          where: { id: roomId },
          data: { status: "COUNTDOWN", startedAt: new Date() },
        });

        // Emit game start envelope
        io.to(roomId).emit("v1:game:start", {
          eventType: "v1:game:start",
          roomId,
          senderId: "server",
          ts: Date.now(),
          payload: {
            playerIds: activePlayers.map((p) => p.userId),
            totalRounds: room.totalRounds,
          },
        });

        logger.info("All players ready — starting game", { roomId });

        // Run game loop in background (fire-and-forget; errors logged internally)
        const playerIds = activePlayers.map((p) => p.userId);
        void gameOrchestrator
          .startGame(roomId, playerIds, io)
          .catch((err: unknown) => {
            logger.error("GameOrchestrator error", {
              roomId,
              message: err instanceof Error ? err.message : String(err),
            });
          });
      }
    } catch (err) {
      logger.error("Error in v1:player:ready", {
        userId,
        roomId,
        message: err instanceof Error ? err.message : String(err),
      });
      emitError(socket, "INTERNAL_ERROR", "Failed to process player ready", roomId);
    }
  });

  // ── v1:player:answer ─────────────────────────────────────────────────────

  socket.on("v1:player:answer", async (raw: unknown) => {
    const parsed = playerAnswerSchema.safeParse(raw);
    if (!parsed.success) {
      emitError(socket, "VALIDATION_ERROR", "Invalid payload for v1:player:answer");
      return;
    }

    const { roomId, payload } = parsed.data;
    const { roundId, answerIndex, clientTs, questionStartTs, timeLimitMs } = payload;

    try {
      if (!redisService) throw new Error("Redis unavailable");

      const serverNow = Date.now();

      // Server-authoritative time boost check
      const extraMs = await powerUpService.getTimeBoostMs(roomId, userId);
      const effectiveLimit = timeLimitMs + extraMs;
      const deadline = questionStartTs + effectiveLimit + 500; // 500ms grace

      if (serverNow > deadline) {
        emitError(socket, "ANSWER_TOO_LATE", "Answer received after deadline", roomId);
        return;
      }

      if (extraMs > 0) {
        await powerUpService.consumeTimeBoost(roomId, userId);
      }

      // Prevent duplicate submissions
      const lockKey = `answer_lock:${roomId}:${userId}:${roundId}`;
      const locked = await redisService.setnx(lockKey, "1", ANSWER_LOCK_TTL_SECONDS);
      if (!locked) {
        emitError(socket, "ALREADY_ANSWERED", "Already submitted an answer this round", roomId);
        return;
      }

      // Load question context to check correctness
      const questionCtx = await redisService.getJson<{
        questionId: string;
        correctIndex: number;
        startTs: number;
        timeLimitMs: number;
      }>(`game:${roomId}:current_question`);

      const isCorrect = questionCtx
        ? answerIndex === questionCtx.correctIndex
        : false;

      // Score using server-authoritative elapsed time
      const authoritativeElapsedMs = Math.max(0, serverNow - (questionCtx?.startTs ?? questionStartTs));
      const score = isCorrect ? scoreFromLatency(authoritativeElapsedMs, effectiveLimit) : 0;

      // Update cumulative score in Redis sorted set
      if (isCorrect && score > 0) {
        await redisService.zincrby(`room:${roomId}:scores`, score, userId);
      }

      // Persist answer details for round resolution
      await redisService.hset(
        `room:${roomId}:round:${roundId}:answers`,
        userId,
        JSON.stringify({
          answerIndex,
          isCorrect,
          authoritativeElapsedMs,
          score,
          submittedAt: serverNow,
        })
      );

      // Write to DB
      await prisma.answer.upsert({
        where: { roundId_userId: { roundId, userId } },
        create: {
          id: generateId(),
          roundId,
          userId,
          answerIndex,
          isCorrect,
          answerTimeMs: authoritativeElapsedMs,
        },
        update: {
          answerIndex,
          isCorrect,
          answerTimeMs: authoritativeElapsedMs,
        },
      });

      logger.info("Answer submitted", {
        userId, roomId, roundId, isCorrect, score,
      });

      // Acknowledge to the answering player
      socket.emit("v1:round:question", {
        eventType: "v1:round:question",
        roomId,
        senderId: "server",
        ts: serverNow,
        payload: {
          type: "answer_ack",
          roundId,
          isCorrect,
          score,
          answerTimeMs: authoritativeElapsedMs,
        },
      });

      // Broadcast to room that this player has answered (no correct/index leaked)
      io.to(roomId).emit("v1:leaderboard:update", {
        eventType: "v1:leaderboard:update",
        roomId,
        senderId: "server",
        ts: serverNow,
        payload: {
          type: "answer_submitted",
          playerId: userId,
          score,
          roundId,
        },
      });
    } catch (err) {
      logger.error("Error in v1:player:answer", {
        userId,
        roomId,
        message: err instanceof Error ? err.message : String(err),
      });
      emitError(socket, "INTERNAL_ERROR", "Failed to process answer", roomId);
    }
  });

  // ── v1:powerup:use ───────────────────────────────────────────────────────

  socket.on("v1:powerup:use", async (raw: unknown) => {
    const parsed = powerupUseSchema.safeParse(raw);
    if (!parsed.success) {
      emitError(socket, "VALIDATION_ERROR", "Invalid payload for v1:powerup:use");
      return;
    }

    const { roomId, payload } = parsed.data;
    const { powerupCode, roundId } = payload;

    try {
      if (!redisService) throw new Error("Redis unavailable");

      // Load current question context for option-aware effects
      const questionCtx = await redisService.getJson<{
        questionId: string;
        options: string[];
        correctIndex: number;
      }>(`game:${roomId}:current_question`);

      await powerUpService.activatePowerUp(roomId, userId, powerupCode, io, {
        roundId,
        questionOptions: questionCtx?.options,
        correctIndex: questionCtx?.correctIndex,
      });
    } catch (err) {
      logger.error("Error in v1:powerup:use", {
        userId,
        roomId,
        powerupCode,
        message: err instanceof Error ? err.message : String(err),
      });
      emitError(
        socket,
        "POWERUP_ERROR",
        err instanceof Error ? err.message : "Failed to activate power-up",
        roomId
      );
    }
  });

  // ── v1:chat:send ─────────────────────────────────────────────────────────

  socket.on("v1:chat:send", async (raw: unknown) => {
    const parsed = chatSendSchema.safeParse(raw);
    if (!parsed.success) {
      emitError(socket, "VALIDATION_ERROR", "Invalid payload for v1:chat:send");
      return;
    }

    const { roomId, payload } = parsed.data;
    const { message } = payload;

    try {
      if (!redisService) throw new Error("Redis unavailable");

      // Simple rate-limiting via Redis counter
      const rateLimitKey = `chat:ratelimit:${roomId}:${userId}`;
      const count = await redisService.incr(rateLimitKey);
      if (count === 1) {
        // First message — set a sliding window expiry
        await redisService.expire(rateLimitKey, Math.ceil(CHAT_RATE_LIMIT_WINDOW_MS / 1000));
      }

      if (count > CHAT_MAX_IN_WINDOW) {
        emitError(socket, "RATE_LIMITED", "Sending messages too fast", roomId);
        return;
      }

      const ts = Date.now();

      // Relay to all room members
      io.to(roomId).emit("v1:chat:message", {
        eventType: "v1:chat:message",
        roomId,
        senderId: userId,
        ts,
        payload: {
          message,
          senderDisplayName: socket.data.displayName ?? userId,
        },
      });

      logger.info("Chat message relayed", { roomId, userId });
    } catch (err) {
      logger.error("Error in v1:chat:send", {
        userId,
        roomId,
        message: err instanceof Error ? err.message : String(err),
      });
      emitError(socket, "INTERNAL_ERROR", "Failed to send chat message", roomId);
    }
  });

  // ── Disconnect: mark player as timed-out for the game loop ───────────────

  socket.on("disconnect", async (reason: string) => {
    logger.info("Socket disconnected in gameHandlers", { userId, reason });

    // Find active rooms this player is in and mark them as disconnected
    // The GameOrchestrator will auto-answer them wrong via the heartbeat check
    try {
      const rooms = await prisma.roomPlayer.findMany({
        where: { userId, room: { status: { in: ["COUNTDOWN", "QUESTION_ACTIVE", "ANSWER_LOCKED", "ROUND_RESULT", "ELIMINATION", "FINALE"] } } },
        select: { roomId: true },
      });

      if (redisService) {
        await Promise.all(
          rooms.map(({ roomId }) =>
            redisService!.set(
              `room:${roomId}:player:${userId}:disconnected`,
              "1",
              120 // 2-minute grace window for reconnect
            )
          )
        );
      }
    } catch (err) {
      logger.error("Error handling disconnect in gameHandlers", {
        userId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

// ─── Local helper (avoid circular import from ulid) ────────────────────────

import { generateId } from "../utils/ulid";
