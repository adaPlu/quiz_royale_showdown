import type { Server, Socket } from "socket.io";
import { z } from "zod";

import { scoreAnswer } from "../game/ScoringEngine";
import { validateAnswerTiming } from "../game/TimerAuthority";
import { prisma } from "../models/prismaClient";
import { gameOrchestrator } from "../services/GameOrchestrator";
import { powerUpService } from "../services/PowerUpService";
import { redisService } from "../services/RedisService";
import { roomService } from "../services/RoomService";
import type { ClientEvents, ServerEvents } from "../types/contracts";
import { logger } from "../utils/logger";
import { generateId } from "../utils/ulid";

const envelopeSchema = z.object({
  type: z.string(),
  version: z.literal("v1"),
  payload: z.unknown(),
});

const createRoomSchema = z.object({
  isPrivate: z.boolean().optional(),
  maxPlayers: z.number().int().min(2).max(100).optional(),
});

const joinRoomSchema = z.object({
  roomCode: z.string().trim().min(1).max(8),
});

const roomIdSchema = z.object({
  roomId: z.string().min(1),
});

const submitAnswerSchema = z.object({
  roomId: z.string().min(1),
  questionId: z.string().min(1),
  answerIndex: z.number().int().min(0).max(3),
  clientSentAt: z.string().datetime(),
});

const powerUpSchema = z.object({
  roomId: z.string().min(1),
  powerUpId: z.string().min(1),
  targetPlayerId: z.string().min(1).optional(),
});

type CurrentQuestionContext = {
  roundId: string;
  roundNumber: number;
  questionId: string;
  prompt: string;
  answers: string[];
  correctAnswerIndex: number;
  startedAtMs: number;
  timeLimitMs: number;
};

const ANSWER_LOCK_TTL_SECONDS = 60 * 60;
const GAME_LOOP_TTL_SECONDS = 2 * 60 * 60;
const localStartedRooms = new Set<string>();

export const registerSocketHandlers = (io: Server): void => {
  io.on("connection", (socket) => {
    socket.on("message", (message: ClientEvents | unknown) => {
      void handleEnvelope(io, socket, message);
    });

    socket.on("disconnect", () => {
      const userId = getUserId(socket);
      logger.info("Socket disconnected", { socketId: socket.id, userId });
    });
  });
};

async function handleEnvelope(io: Server, socket: Socket, raw: unknown): Promise<void> {
  const parsedEnvelope = envelopeSchema.safeParse(raw);
  if (!parsedEnvelope.success) {
    emitError(socket, "VALIDATION_ERROR", "Invalid WebSocket envelope");
    return;
  }

  const userId = getUserId(socket);
  if (!userId) {
    emitError(socket, "UNAUTHORIZED", "Socket is missing authenticated user context");
    return;
  }

  const { type, payload } = parsedEnvelope.data;

  try {
    switch (type) {
      case "room:create":
        await handleCreateRoom(socket, userId, payload);
        return;

      case "room:join":
        await handleJoinRoom(io, socket, userId, payload);
        return;

      case "room:ready":
        await handleRoomReady(io, socket, userId, payload);
        return;

      case "room:start":
        await handleRoomStart(io, socket, userId, payload);
        return;

      case "room:leave":
        await handleRoomLeave(io, socket, userId, payload);
        return;

      case "room:reconnect":
        await handleReconnect(socket, payload);
        return;

      case "round:submit_answer":
        await handleSubmitAnswer(io, socket, userId, payload);
        return;

      case "powerup:activate":
        await handlePowerUp(io, socket, userId, payload);
        return;

      case "client:heartbeat":
        return;

      default:
        emitError(socket, "UNKNOWN_EVENT", `Unsupported event type: ${type}`);
    }
  } catch (error) {
    logger.error("Socket handler failed", {
      socketId: socket.id,
      userId,
      type,
      message: error instanceof Error ? error.message : String(error),
    });
    emitError(socket, "INTERNAL_ERROR", error instanceof Error ? error.message : "Socket handler failed");
  }
}

async function handleCreateRoom(socket: Socket, userId: string, payload: unknown): Promise<void> {
  const parsed = createRoomSchema.safeParse(payload);
  if (!parsed.success) {
    emitError(socket, "VALIDATION_ERROR", "Invalid room:create payload");
    return;
  }

  const room = await roomService.createRoom(userId, parsed.data);
  await socket.join(room.id);
  emit(socket, {
    type: "room:state_sync",
    version: "v1",
    payload: { room: roomService.toSnapshot(room) },
  });
}

async function handleJoinRoom(io: Server, socket: Socket, userId: string, payload: unknown): Promise<void> {
  const parsed = joinRoomSchema.safeParse(payload);
  if (!parsed.success) {
    emitError(socket, "VALIDATION_ERROR", "Invalid room:join payload");
    return;
  }

  const { room, snapshot, joined } = await roomService.joinRoom(userId, parsed.data.roomCode);
  await socket.join(room.id);
  emit(socket, {
    type: "room:state_sync",
    version: "v1",
    payload: { room: snapshot },
  });

  const player = snapshot.players.find((entry) => entry.id === userId);
  if (joined && player) {
    emitToRoom(io, room.id, {
      type: "room:player_joined",
      version: "v1",
      payload: { roomId: room.id, player },
    });
  }
}

async function handleRoomReady(io: Server, socket: Socket, userId: string, payload: unknown): Promise<void> {
  const parsed = roomIdSchema.safeParse(payload);
  if (!parsed.success) {
    emitError(socket, "VALIDATION_ERROR", "Invalid room:ready payload");
    return;
  }

  const { roomId } = parsed.data;
  await socket.join(roomId);
  const ready = await roomService.markReady(roomId, userId);

  emitToRoom(io, roomId, {
    type: "room:ready_state",
    version: "v1",
    payload: { roomId, readyPlayerIds: ready.readyPlayerIds, allReady: ready.allReady },
  });

  if (ready.allReady) {
    const room = await roomService.getRoom(roomId);
    if (room.status === "WAITING") {
      await roomService.startGame(roomId, room.hostUserId);
      await startGameLoopOnce(io, roomId);
    }
  }
}

async function handleRoomStart(io: Server, _socket: Socket, userId: string, payload: unknown): Promise<void> {
  const parsed = roomIdSchema.safeParse(payload);
  if (!parsed.success) {
    return emitError(_socket, "VALIDATION_ERROR", "Invalid room:start payload");
  }

  await roomService.startGame(parsed.data.roomId, userId);
  await startGameLoopOnce(io, parsed.data.roomId);
}

async function handleRoomLeave(io: Server, socket: Socket, userId: string, payload: unknown): Promise<void> {
  const parsed = roomIdSchema.safeParse(payload);
  if (!parsed.success) {
    emitError(socket, "VALIDATION_ERROR", "Invalid room:leave payload");
    return;
  }

  await roomService.leaveRoom(parsed.data.roomId, userId);
  await socket.leave(parsed.data.roomId);
  emitToRoom(io, parsed.data.roomId, {
    type: "room:player_left",
    version: "v1",
    payload: { roomId: parsed.data.roomId, playerId: userId },
  });
}

async function handleReconnect(socket: Socket, payload: unknown): Promise<void> {
  const parsed = roomIdSchema.safeParse(payload);
  if (!parsed.success) {
    emitError(socket, "VALIDATION_ERROR", "Invalid room:reconnect payload");
    return;
  }

  const { roomId } = parsed.data;
  await socket.join(roomId);
  emit(socket, {
    type: "room:state_sync",
    version: "v1",
    payload: { room: await roomService.getSnapshot(roomId) },
  });

  const currentQuestion = await loadCurrentQuestion(roomId);
  if (currentQuestion) {
    emit(socket, {
      type: "round:question_started",
      version: "v1",
      payload: {
        roomId,
        roundId: currentQuestion.roundId,
        questionId: currentQuestion.questionId,
        prompt: currentQuestion.prompt,
        answers: currentQuestion.answers,
        timeLimitMs: currentQuestion.timeLimitMs,
        startedAt: new Date(currentQuestion.startedAtMs).toISOString(),
      },
    });
  }
}

async function handleSubmitAnswer(io: Server, socket: Socket, userId: string, payload: unknown): Promise<void> {
  const parsed = submitAnswerSchema.safeParse(payload);
  if (!parsed.success) {
    emitError(socket, "VALIDATION_ERROR", "Invalid round:submit_answer payload");
    return;
  }
  if (!redisService) {
    emitError(socket, "SERVICE_UNAVAILABLE", "Redis is required for answer submission");
    return;
  }

  const { roomId, questionId, answerIndex } = parsed.data;
  const currentQuestion = await loadCurrentQuestion(roomId);
  if (!currentQuestion || currentQuestion.questionId !== questionId) {
    emitError(socket, "QUESTION_NOT_ACTIVE", "Question is not active", roomId);
    return;
  }

  const roomPlayer = await prisma.roomPlayer.findUnique({
    where: { roomId_userId: { roomId, userId } },
    select: { score: true, streak: true, isEliminated: true },
  });
  if (!roomPlayer || roomPlayer.isEliminated) {
    emitError(socket, "NOT_ACTIVE_PLAYER", "Player is not active in this room", roomId);
    return;
  }

  const extraTimeMs = await powerUpService.getTimeBoostMs(roomId, userId);
  const timing = validateAnswerTiming({
    questionStartedAtMs: currentQuestion.startedAtMs,
    answerReceivedAtMs: Date.now(),
    timeLimitMs: currentQuestion.timeLimitMs + extraTimeMs,
  });
  if (!timing.accepted) {
    emitError(socket, "ANSWER_REJECTED", `Answer rejected: ${timing.reason}`, roomId);
    return;
  }

  const lockKey = `answer_lock:${roomId}:${currentQuestion.roundId}:${userId}`;
  const locked = await redisService.setnx(lockKey, "1", ANSWER_LOCK_TTL_SECONDS);
  if (!locked) {
    emitError(socket, "ALREADY_ANSWERED", "Already submitted an answer for this round", roomId);
    return;
  }

  if (extraTimeMs > 0) {
    await powerUpService.consumeTimeBoost(roomId, userId);
  }

  const sabotaged = await powerUpService.consumeSabotage(roomId, userId);
  const isCorrect = !sabotaged && answerIndex === currentQuestion.correctAnswerIndex;
  const multiplier = await powerUpService.consumeScoreMultiplier(roomId, userId);
  const score = scoreAnswer({
    isCorrect,
    answerTimeMs: timing.scoringElapsedMs,
    timeLimitMs: currentQuestion.timeLimitMs + extraTimeMs,
    currentStreak: roomPlayer.streak,
  });
  const scoreDelta = Math.round(score.awardedScore * multiplier);
  const nextStreak = isCorrect ? score.nextStreak : 0;

  await prisma.$transaction([
    prisma.answer.upsert({
      where: { roundId_userId: { roundId: currentQuestion.roundId, userId } },
      create: {
        id: generateId(),
        roundId: currentQuestion.roundId,
        userId,
        answerIndex,
        isCorrect,
        answerTimeMs: timing.scoringElapsedMs,
      },
      update: {
        answerIndex,
        isCorrect,
        answerTimeMs: timing.scoringElapsedMs,
      },
    }),
    prisma.roomPlayer.update({
      where: { roomId_userId: { roomId, userId } },
      data: {
        score: { increment: scoreDelta },
        streak: nextStreak,
      },
    }),
  ]);

  if (scoreDelta > 0) {
    await redisService.zincrby(`room:${roomId}:scores`, scoreDelta, userId);
  }
  await redisService.hset(
    `room:${roomId}:round:${currentQuestion.roundId}:answers`,
    userId,
    JSON.stringify({
      answerIndex,
      isCorrect,
      scoreDelta,
      answerTimeMs: timing.scoringElapsedMs,
      submittedAt: new Date().toISOString(),
    }),
  );

  emitToRoom(io, roomId, {
    type: "round:answer_submitted",
    version: "v1",
    payload: {
      roomId,
      roundId: currentQuestion.roundId,
      playerId: userId,
      accepted: true,
    },
  });
}

async function handlePowerUp(io: Server, socket: Socket, userId: string, payload: unknown): Promise<void> {
  const parsed = powerUpSchema.safeParse(payload);
  if (!parsed.success) {
    emitError(socket, "VALIDATION_ERROR", "Invalid powerup:activate payload");
    return;
  }

  const currentQuestion = await loadCurrentQuestion(parsed.data.roomId);
  const result = await powerUpService.activatePowerUp(
    {
      roomId: parsed.data.roomId,
      userId,
      powerUpId: parsed.data.powerUpId,
      targetPlayerId: parsed.data.targetPlayerId,
      roundId: currentQuestion?.roundId,
      questionOptions: currentQuestion?.answers,
      correctAnswerIndex: currentQuestion?.correctAnswerIndex,
    },
    io,
  );

  emitToRoom(io, parsed.data.roomId, {
    type: "powerup:activated",
    version: "v1",
    payload: {
      roomId: parsed.data.roomId,
      powerUpId: result.powerUpId,
      userId,
      effect: result.publicEffect,
    },
  });

  if (result.privateEffect) {
    emit(socket, {
      type: "powerup:effect",
      version: "v1",
      payload: {
        roomId: parsed.data.roomId,
        powerUpId: result.powerUpId,
        userId,
        effect: result.privateEffect,
      },
    });
  }
}

async function startGameLoopOnce(io: Server, roomId: string): Promise<void> {
  if (redisService) {
    const acquired = await redisService.setnx(`game:${roomId}:loop_started`, "1", GAME_LOOP_TTL_SECONDS);
    if (!acquired) {
      return;
    }
  } else if (localStartedRooms.has(roomId)) {
    return;
  } else {
    localStartedRooms.add(roomId);
  }

  const room = await roomService.getRoom(roomId);
  const playerIds = room.players.filter((player) => !player.isEliminated).map((player) => player.userId);

  void gameOrchestrator.startGame(roomId, playerIds, io).catch((error: unknown) => {
    logger.error("Game loop crashed", {
      roomId,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  });
}

async function loadCurrentQuestion(roomId: string): Promise<CurrentQuestionContext | null> {
  if (!redisService) {
    return null;
  }
  return redisService.getJson<CurrentQuestionContext>(`game:${roomId}:current_question`);
}

function getUserId(socket: Socket): string | null {
  return (socket.data.userId as string | undefined) ?? socket.data.user?.userId ?? null;
}

function emit(socket: Socket, event: ServerEvents): void {
  socket.emit("message", event);
}

function emitToRoom(io: Server, roomId: string, event: ServerEvents): void {
  io.to(roomId).emit("message", event);
}

function emitError(socket: Socket, code: string, message: string, roomId?: string): void {
  socket.emit("message", {
    type: "error",
    version: "v1",
    payload: { code, message, roomId },
  });
}
