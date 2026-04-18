/**
 * Handler: v1:submit_answer
 *
 * Server-side timing validation, duplicate-submission prevention via Redis SETNX,
 * score calculation, and broadcast of v1:answer_locked.
 */

import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { redisService } from "../../services/RedisService";
import { logger } from "../../utils/logger";

const submitAnswerSchema = z.object({
  roomId: z.string().min(1),
  roundId: z.string().min(1),
  answerIndex: z.number().int().min(0).max(3),
  clientTs: z.number().int().positive(),        // client epoch ms when submitted
  questionStartTs: z.number().int().positive(),  // epoch ms when question was emitted
  timeLimitMs: z.number().int().positive(),
});

const ANSWER_LOCK_TTL_SECONDS = 3600; // 1 hour

function calculateScore(latencyMs: number, timeLimitMs: number): number {
  return Math.max(0, 1000 - Math.floor((latencyMs / timeLimitMs) * 400));
}

export function registerSubmitAnswerHandler(io: Server, socket: Socket): void {
  socket.on("v1:submit_answer", async (payload: unknown) => {
    const parsed = submitAnswerSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit("v1:error", {
        code: "VALIDATION_ERROR",
        message: "Invalid payload for v1:submit_answer",
        issues: parsed.error.flatten(),
      });
      return;
    }

    const { roomId, roundId, answerIndex, clientTs, questionStartTs, timeLimitMs } = parsed.data;
    const userId = socket.data.userId as string;

    try {
      if (!redisService) {
        throw new Error("Redis unavailable");
      }

      // Server-side timing validation
      const serverNow = Date.now();
      const deadline = questionStartTs + timeLimitMs + 500; // 500ms grace
      if (clientTs > deadline) {
        socket.emit("v1:error", {
          code: "ANSWER_TOO_LATE",
          message: "Answer submitted after deadline",
        });
        return;
      }

      // Prevent duplicate submissions via SETNX
      const lockKey = `answer_lock:${roomId}:${userId}:${roundId}`;
      const locked = await redisService.setnx(lockKey, "1", ANSWER_LOCK_TTL_SECONDS);
      if (!locked) {
        socket.emit("v1:error", {
          code: "ALREADY_ANSWERED",
          message: "You have already submitted an answer for this round",
        });
        return;
      }

      // Calculate score based on latency
      const latencyMs = Math.max(0, clientTs - questionStartTs);
      const score = calculateScore(latencyMs, timeLimitMs);

      // Increment cumulative score in Redis sorted set (room:roomId:scores, score=total)
      await redisService.zincrby(`room:${roomId}:scores`, score, userId);

      // Store answer detail for round resolution
      await redisService.hset(
        `room:${roomId}:round:${roundId}:answers`,
        userId,
        JSON.stringify({ answerIndex, latencyMs, score, submittedAt: serverNow })
      );

      logger.info("Answer submitted", { userId, roomId, roundId, score, latencyMs });

      // Broadcast answer_locked to room WITHOUT revealing answerIndex
      io.to(roomId).emit("v1:answer_locked", {
        roomId,
        roundId,
        userId,
        score,
        lockedAt: new Date(serverNow).toISOString(),
      });
    } catch (err) {
      logger.error("Error in submitAnswer handler", {
        userId,
        roomId,
        roundId,
        message: err instanceof Error ? err.message : String(err),
      });
      socket.emit("v1:error", {
        code: "INTERNAL_ERROR",
        message: "Failed to submit answer",
      });
    }
  });
}
