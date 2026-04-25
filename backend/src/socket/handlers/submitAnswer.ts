import type { Server } from "socket.io";
import { z } from "zod";
import { redisService } from "../../services/RedisService";
import type { SocketErrorEvent } from "../../types/contracts";
import { logger } from "../../utils/logger";
import type { AuthenticatedSocket } from "../middleware";

const submitAnswerSchema = z.object({
  roomId: z.string().min(1),
  questionId: z.string().min(1),
  answerIndex: z.number().int().min(0).max(3),
  clientSentAt: z.string().datetime()
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

    const { roomId, questionId, answerIndex, clientSentAt } = parsed.data;
    const userId = socket.data.userId;

    try {
      if (!redisService) {
        throw new Error("Redis unavailable");
      }

      if (socket.data.roomId && socket.data.roomId !== roomId) {
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

      const receivedAtMs = Date.now();
      const deadline = questionContext.startTs + questionContext.timeLimitMs + ANSWER_GRACE_MS;

      if (receivedAtMs > deadline) {
        emitError(socket, "ANSWER_TOO_LATE", "Answer submitted after the round was locked");
        return;
      }

      const lockKey = `answer_lock:${roomId}:${questionContext.roundId}:${userId}`;
      const locked = await redisService.setnx(lockKey, "1", ANSWER_LOCK_TTL_SECONDS);
      if (!locked) {
        emitError(socket, "ALREADY_ANSWERED", "You have already submitted an answer for this round");
        return;
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
          submittedAt: new Date(receivedAtMs).toISOString()
        })
      );

      logger.info("Answer submitted", {
        roomId,
        roundId: questionContext.roundId,
        userId,
        isCorrect,
        scoreDelta
      });
    } catch (error) {
      logger.error("Error in submitAnswer handler", {
        userId,
        roomId,
        questionId,
        message: error instanceof Error ? error.message : String(error)
      });
      emitError(socket, "INTERNAL_ERROR", "Failed to submit answer");
    }
  });
}
