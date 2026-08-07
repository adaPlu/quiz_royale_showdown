import { Prisma } from "@prisma/client";
import type { Server } from "socket.io";
import { z } from "zod";

import { prisma } from "../../models/prismaClient";
import { powerUpWagerService } from "../../services/PowerUpWagerService";
import { redisService } from "../../services/RedisService";
import type { SocketErrorEvent } from "../../types/contracts";
import { AppError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { generateId } from "../../utils/ulid";
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
const DEFAULT_TIME_LIMIT_MS = 20_000;

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

async function loadCurrentQuestion(
  roomId: string,
  questionId: string,
): Promise<CurrentQuestionContext | null> {
  const cached = redisService
    ? await redisService.getJson<CurrentQuestionContext>(`game:${roomId}:current_question`)
    : null;
  if (cached?.questionId === questionId) return cached;

  const round = await prisma.round.findFirst({
    where: {
      roomId,
      questionId,
      resolvedAt: null,
    },
    orderBy: { roundNumber: "desc" },
    include: { question: true },
  });

  if (!round?.startedAt || round.lockedAt) return null;

  const startTs = round.startedAt.getTime();
  return {
    roundId: round.id,
    questionId: round.questionId,
    prompt: round.question.prompt,
    answers: [
      round.question.optionA,
      round.question.optionB,
      round.question.optionC,
      round.question.optionD,
    ],
    correctAnswerIndex: round.question.correctIndex,
    startTs,
    startedAt: round.startedAt.toISOString(),
    timeLimitMs: DEFAULT_TIME_LIMIT_MS,
  };
}

function isDuplicateAnswerError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
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
      if (!socket.data.roomId) {
        emitError(socket, "ROOM_NOT_JOINED", "Socket has not joined a room");
        return;
      }

      if (socket.data.roomId !== roomId) {
        emitError(socket, "ROOM_MISMATCH", "Socket is not joined to the requested room");
        return;
      }

      const questionContext = await loadCurrentQuestion(roomId, questionId);

      if (!questionContext) {
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

      if (redisService) {
        lockKey = `answer_lock:${roomId}:${questionContext.roundId}:${userId}`;
        const locked = await redisService.setnx(lockKey, "1", ANSWER_LOCK_TTL_SECONDS);
        if (!locked) {
          emitError(socket, "ALREADY_ANSWERED", "You have already submitted an answer for this round");
          return;
        }
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
      const answerTimeMs = Math.max(0, receivedAtMs - questionContext.startTs);
      const scoreDelta = isCorrect
        ? calculateScore(receivedAtMs, questionContext.startTs, questionContext.timeLimitMs)
        : 0;

      const persisted = await prisma.$transaction(async (tx) => {
        await tx.answer.create({
          data: {
            id: generateId(),
            roundId: questionContext.roundId,
            userId,
            answerIndex,
            isCorrect,
            answerTimeMs,
            submittedAt: new Date(receivedAtMs),
          },
        });

        return tx.roomPlayer.update({
          where: { roomId_userId: { roomId, userId } },
          data: isCorrect
            ? {
                score: { increment: scoreDelta },
                streak: { increment: 1 },
              }
            : {
                streak: 0,
              },
          select: { score: true },
        });
      });

      if (redisService) {
        const cacheResults = await Promise.allSettled([
          redisService.zadd(`room:${roomId}:scores`, persisted.score, userId),
          redisService.hset(
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
          ),
        ]);
        if (cacheResults.some((result) => result.status === "rejected")) {
          logger.warn("Answer persisted but Redis cache update was incomplete", {
            roomId,
            roundId: questionContext.roundId,
            userId,
          });
        }
      }

      logger.info("Answer submitted", {
        roomId,
        roundId: questionContext.roundId,
        userId,
        isCorrect,
        scoreDelta,
        wagerPowerUpId,
      });
    } catch (error) {
      if (isDuplicateAnswerError(error)) {
        if (wagerPlaced && activeRoundId) {
          await powerUpWagerService.refundWager(activeRoundId, userId).catch(() => undefined);
        }
        emitError(socket, "ALREADY_ANSWERED", "You have already submitted an answer for this round");
        return;
      }

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
