import type { Server } from "socket.io";
import { z } from "zod";
import { powerUpWagerService } from "../../services/PowerUpWagerService";
import { redisService } from "../../services/RedisService";
import type { SocketErrorEvent } from "../../types/contracts";
import { AppError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import type { AuthenticatedSocket } from "../middleware";

const submitAnswerSchema = z.object({
  roomId: z.string().min(1),
  questionId: z.string().min(1),
  answerIndex: z.number().int().min(0).max(3),
  clientSentAt: z.string().datetime(),
  wagerPowerUpId: z.string().min(1).optional(),
});

const ANSWER_LOCK_TTL_SECONDS = 3600;
const ANSWER_GRACE_MS = 500;

type CurrentQuestionContext = {
  roundId: string;
  questionId: string;
  prompt: string;
  answers: string[];
  correctAnswerIndex: number;
  startTs: number;
  startedAt: string;
  timeLimitMs: number;
};

const emitError = (
  socket: AuthenticatedSocket,
  code: string,
  message: string,
  details?: unknown
): void => {
  const envelope: SocketErrorEvent = {
    type: "error",
    version: "v1",
    payload: { code, message, details }
  };

  socket.emit("message", envelope);
};

function calculateScore(receivedAtMs: number, startTs: number, timeLimitMs: number): number {
  const elapsedMs = Math.max(0, receivedAtMs - startTs);
  return Math.max(0, 1000 - Math.floor((elapsedMs / timeLimitMs) * 400));
}

export function registerSubmitAnswerHandler(_io: Server, socket: AuthenticatedSocket): void {
  socket.on("message", async (message: unknown) => {
    if (
      !message ||
      typeof message !== "object" ||
      !("type" in message) ||
      (message as { type?: string }).type !== "round:submit_answer"
    ) {
      return;
    }

    const parsed = submitAnswerSchema.safeParse(
      (message as { payload?: unknown }).payload
    );
    if (!parsed.success) {
      emitError(socket, "VALIDATION_ERROR", "Invalid payload for round:submit_answer", parsed.error.flatten());
      return;
    }

    const { roomId, questionId, answerIndex, clientSentAt, wagerPowerUpId } = parsed.data;
    const userId = socket.data.userId;
    let lockKey: string | null = null;
    let activeRoundId: string | null = null;
    let wagerPlaced = false;

    try {
      if (!redisService) {
        throw new Error("Redis unavailable");
      }

      if (!socket.data.roomId) {
        emitError(socket, "ROOM_NOT_JOINED", "Socket has not joined a room");
        return;
      }

      if (socket.data.roomId !== roomId) {
        emitError(socket, "ROOM_MISMATCH", "Socket is not joined to the requested room");
        return;
      }

      const questionContext = await redisService.getJson<CurrentQuestionContext>(
        `game:${roomId}:current_question`
      );

      if (!questionContext || questionContext.questionId !== questionId) {
        emitError(socket, "QUESTION_NOT_ACTIVE", "Question is no longer active for this room");
        return;
      }
      activeRoundId = questionContext.roundId;

      const receivedAtMs = Date.now();
      const deadline = questionContext.startTs + questionContext.timeLimitMs + ANSWER_GRACE_MS;

      if (receivedAtMs > deadline) {
        emitError(socket, "ANSWER_TOO_LATE", "Answer submitted after the round was locked");
        return;
      }

      lockKey = `answer_lock:${roomId}:${questionContext.roundId}:${userId}`;
      const locked = await redisService.setnx(lockKey, "1", ANSWER_LOCK_TTL_SECONDS);
      if (!locked) {
        emitError(socket, "ALREADY_ANSWERED", "You have already submitted an answer for this round");
        return;
      }

      if (wagerPowerUpId) {
        await powerUpWagerService.placeWager({
          roomId,
          roundId: questionContext.roundId,
          userId,
          powerUpId: wagerPowerUpId,
        });
        wagerPlaced = true;
      }

      const isCorrect = answerIndex === questionContext.correctAnswerIndex;
      const scoreDelta = isCorrect
        ? calculateScore(receivedAtMs, questionContext.startTs, questionContext.timeLimitMs)
        : 0;

      await redisService.zincrby(`room:${roomId}:scores`, scoreDelta, userId);

      await redisService.hset(
        `room:${roomId}:round:${questionContext.roundId}:answers`,
        userId,
        JSON.stringify({
          answerIndex,
          clientSentAt,
          isCorrect,
          scoreDelta,
          wagerPowerUpId,
          submittedAt: new Date(receivedAtMs).toISOString()
        })
      );

      logger.info("Answer submitted", {
        roomId,
        roundId: questionContext.roundId,
        userId,
        isCorrect,
        scoreDelta,
        wagerPowerUpId,
      });
    } catch (error) {
      if (redisService && lockKey) {
        await redisService.del(lockKey).catch(() => undefined);
      }
      if (wagerPlaced && activeRoundId) {
        await powerUpWagerService.refundWager(activeRoundId, userId).catch(() => undefined);
      }

      logger.error("Error in submitAnswer handler", {
        userId,
        roomId,
        questionId,
        message: error instanceof Error ? error.message : String(error)
      });
      emitError(
        socket,
        error instanceof AppError ? error.code : "INTERNAL_ERROR",
        error instanceof AppError ? error.message : "Failed to submit answer",
      );
    }
  });
}
