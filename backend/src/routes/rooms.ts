import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { prisma } from "../models/prismaClient";
import {
  GAME_DIFFICULTIES,
  getRoomGameDifficulty,
  setRoomGameDifficulty,
} from "../services/GameDifficultyService";
import { gameOrchestrator } from "../services/GameOrchestrator";
import { gameRunLeaseService } from "../services/GameRunLeaseService";
import {
  LeaveRoomResult,
  RoomLifecycleState,
  roomService,
} from "../services/RoomService";
import { getIo } from "../socket";
import {
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
} from "../utils/errors";
import { isAutomatedTestUser } from "../utils/testUsers";
import { isGuestEmail } from "../utils/guestUsers";
import { isValidId } from "../utils/ulid";

export const roomsRouter = Router();

const gameDifficultySchema = z.enum(GAME_DIFFICULTIES);

const createRoomSchema = z.object({
  isPrivate: z.boolean().optional().default(true),
  maxPlayers: z.number().int().min(2).max(100).optional().default(8),
  difficulty: gameDifficultySchema.optional().default("medium"),
  autoStartSolo: z.boolean().optional().default(false),
});

const ROOM_CODE_LENGTH = 6;
const LEGACY_ROOM_CODE_LENGTH = 8;
const roomCodeLengthMessage =
  "roomCode must be 6 characters (8-character legacy codes are also accepted)";

const supportedRoomCodeSchema = z
  .string()
  .trim()
  .refine(
    (value) =>
      value.length === ROOM_CODE_LENGTH || value.length === LEGACY_ROOM_CODE_LENGTH,
    roomCodeLengthMessage
  )
  .transform((value) => value.toUpperCase());

const joinRoomSchema = z.object({
  roomCode: supportedRoomCodeSchema
    .nullable()
    .optional()
    .transform((value) => value || undefined),
});

const roomCodeParamsSchema = z.object({
  roomCode: supportedRoomCodeSchema,
});

const roomIdParamsSchema = z.object({
  roomId: z.string().trim().refine(isValidId, "roomId must be a valid ULID"),
});

const startRoomSchema = z.object({
  allowSolo: z.boolean().optional().default(false),
});

const updateDifficultySchema = z.object({
  difficulty: gameDifficultySchema,
});

function getAuthenticatedUserId(jwtSub?: string): string {
  if (!jwtSub) {
    throw new UnauthorizedError("Missing authenticated user");
  }

  return jwtSub;
}

async function assertRegisteredAccount(userId: string, action: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true }
  });
  if (!user) throw new UnauthorizedError("User not found");
  if (isGuestEmail(user.email)) {
    throw new ForbiddenError(`Guest players cannot ${action}`);
  }
}

async function assertTestRoomBoundary(
  userId: string,
  roomCode?: string
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, displayName: true },
  });

  if (!user) {
    throw new UnauthorizedError("User not found");
  }

  const requesterIsAutomatedTestUser = isAutomatedTestUser(user);

  if (!roomCode) {
    if (requesterIsAutomatedTestUser) {
      throw new ForbiddenError(
        "Automated test accounts cannot join public matchmaking"
      );
    }

    return;
  }

  const targetRoom = await prisma.room.findUnique({
    where: { code: roomCode },
    select: {
      host: {
        select: { email: true, displayName: true },
      },
    },
  });

  if (!targetRoom) {
    return;
  }

  const roomIsAutomatedTestRoom = isAutomatedTestUser(targetRoom.host);
  if (requesterIsAutomatedTestUser !== roomIsAutomatedTestRoom) {
    throw new ForbiddenError(
      "Automated test accounts and regular players cannot join the same room"
    );
  }
}

async function assertRoomParticipant(roomId: string, requesterId: string) {
  const room = await roomService.getRoomById(roomId);
  const isParticipant =
    room.hostUserId === requesterId ||
    room.room.players.some((player) => player.id === requesterId);

  if (!isParticipant) {
    throw new ForbiddenError("Only room participants can view game settings");
  }

  return room;
}

async function assertHostCanConfigureRoom(roomId: string, requesterId: string) {
  const room = await roomService.getRoomById(roomId);

  if (room.hostUserId !== requesterId) {
    throw new ForbiddenError("Only the host can change game difficulty");
  }

  if (room.room.phase !== "WAITING") {
    throw new ConflictError("Game difficulty cannot be changed after the game starts");
  }

  return room;
}

function formatRoomResponse(
  payload: RoomLifecycleState,
  difficulty: (typeof GAME_DIFFICULTIES)[number],
  wsToken?: string
) {
  return {
    roomId: payload.room.roomId,
    roomCode: payload.room.code,
    room: payload.room,
    hostUserId: payload.hostUserId,
    config: {
      ...payload.config,
      difficulty,
    },
    createdAt: payload.createdAt,
    startedAt: payload.startedAt,
    ...(wsToken ? { wsToken } : {}),
  };
}

function formatRoomLookupResponse(
  payload: RoomLifecycleState,
  requesterId: string,
  difficulty: (typeof GAME_DIFFICULTIES)[number]
) {
  const isRoomParticipant =
    payload.hostUserId === requesterId ||
    payload.room.players.some((player) => player.id === requesterId);

  if (isRoomParticipant) {
    return formatRoomResponse(payload, difficulty);
  }

  return {
    roomCode: payload.room.code,
    room: {
      code: payload.room.code,
      phase: payload.room.phase,
      playerCount: payload.room.players.length,
    },
    config: {
      maxPlayers: payload.config.maxPlayers,
    },
  };
}

function formatLeaveResponse(payload: LeaveRoomResult) {
  return {
    left: payload.left,
    roomId: payload.roomId,
    roomCode: payload.room?.code ?? null,
    roomClosed: payload.roomClosed,
    room: payload.room,
    hostUserId: payload.hostUserId,
    config: payload.config,
    createdAt: payload.createdAt,
    startedAt: payload.startedAt,
  };
}

roomsRouter.post(
  "/",
  requireAuth,
  validate({ body: createRoomSchema }),
  async (req, res, next) => {
    try {
      const hostUserId = getAuthenticatedUserId(req.jwtClaims?.sub);
      const input = req.body as z.infer<typeof createRoomSchema>;
      await assertRegisteredAccount(hostUserId, "create rooms");
      const room = await roomService.createRoom(hostUserId, input);
      await setRoomGameDifficulty(room.room.roomId, input.difficulty);

      res.status(201).json(formatRoomResponse(room, input.difficulty));
    } catch (error) {
      next(error);
    }
  }
);

roomsRouter.post(
  "/join",
  requireAuth,
  validate({ body: joinRoomSchema }),
  async (req, res, next) => {
    try {
      const userId = getAuthenticatedUserId(req.jwtClaims?.sub);
      const { roomCode } = req.body as z.infer<typeof joinRoomSchema>;

      if (!roomCode) await assertRegisteredAccount(userId, "use public matchmaking");
      await assertTestRoomBoundary(userId, roomCode);

      const { room, wsToken } = await roomService.joinRoom(userId, roomCode);
      const lifecycleState = await roomService.getRoomById(room.id);
      const difficulty = await getRoomGameDifficulty(room.id);

      res.json(formatRoomResponse(lifecycleState, difficulty, wsToken));
    } catch (error) {
      next(error);
    }
  }
);

roomsRouter.get(
  "/by-id/:roomId",
  requireAuth,
  validate({ params: roomIdParamsSchema }),
  async (req, res, next) => {
    try {
      const requesterId = getAuthenticatedUserId(req.jwtClaims?.sub);
      const { roomId } = req.params as z.infer<typeof roomIdParamsSchema>;
      const room = await assertRoomParticipant(roomId, requesterId);
      const difficulty = await getRoomGameDifficulty(roomId);

      res.json(formatRoomResponse(room, difficulty));
    } catch (error) {
      next(error);
    }
  }
);

roomsRouter.get(
  "/by-id/:roomId/difficulty",
  requireAuth,
  validate({ params: roomIdParamsSchema }),
  async (req, res, next) => {
    try {
      const requesterId = getAuthenticatedUserId(req.jwtClaims?.sub);
      const { roomId } = req.params as z.infer<typeof roomIdParamsSchema>;
      await assertRoomParticipant(roomId, requesterId);

      res.json({ difficulty: await getRoomGameDifficulty(roomId) });
    } catch (error) {
      next(error);
    }
  }
);

roomsRouter.patch(
  "/by-id/:roomId/difficulty",
  requireAuth,
  validate({ params: roomIdParamsSchema, body: updateDifficultySchema }),
  async (req, res, next) => {
    try {
      const requesterId = getAuthenticatedUserId(req.jwtClaims?.sub);
      const { roomId } = req.params as z.infer<typeof roomIdParamsSchema>;
      const { difficulty } = req.body as z.infer<typeof updateDifficultySchema>;
      await assertHostCanConfigureRoom(roomId, requesterId);
      await setRoomGameDifficulty(roomId, difficulty);

      res.json({ difficulty });
    } catch (error) {
      next(error);
    }
  }
);

roomsRouter.get(
  "/:roomCode",
  requireAuth,
  validate({ params: roomCodeParamsSchema }),
  async (req, res, next) => {
    try {
      const requesterId = getAuthenticatedUserId(req.jwtClaims?.sub);
      const { roomCode } = req.params as z.infer<typeof roomCodeParamsSchema>;
      const room = await roomService.getRoomByCode(roomCode);
      const difficulty = await getRoomGameDifficulty(room.room.roomId);

      res.json(formatRoomLookupResponse(room, requesterId, difficulty));
    } catch (error) {
      next(error);
    }
  }
);

roomsRouter.post(
  "/:roomId/start",
  requireAuth,
  validate({ params: roomIdParamsSchema, body: startRoomSchema }),
  async (req, res, next) => {
    let leaseToken: string | null = null;
    let orchestratorScheduled = false;

    try {
      const requesterId = getAuthenticatedUserId(req.jwtClaims?.sub);
      const { roomId } = req.params as z.infer<typeof roomIdParamsSchema>;
      const { allowSolo } = req.body as z.infer<typeof startRoomSchema>;

      await roomService.recoverStaleCountdown(
        roomId,
        await gameRunLeaseService.isActive(roomId),
      );

      leaseToken = await gameRunLeaseService.acquire(roomId);

      const room = await roomService.startGame(roomId, requesterId, { allowSolo });
      const difficulty = await getRoomGameDifficulty(roomId);
      try {
        await gameOrchestrator.assertQuestionBankReady(
          difficulty,
          room.room.totalRounds,
        );
      } catch (error) {
        await roomService.resetStartFailure(
          roomId,
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }

      const playerRows = await prisma.roomPlayer.findMany({
        where: { roomId },
        select: { userId: true },
      });
      const playerIds = playerRows.map((row) => row.userId);
      const io = getIo();
      const ownedLeaseToken = leaseToken;
      orchestratorScheduled = true;

      void gameOrchestrator
        .startGame(roomId, playerIds, io)
        .catch(async (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[rooms] GameOrchestrator.startGame failed", { roomId, message });
          await roomService.resetStartFailure(roomId, message).catch(() => undefined);
          const recovered = await roomService.getRoomById(roomId).catch(() => null);
          if (recovered) {
            io.to(roomId).emit("message", {
              type: "room:state_sync",
              version: "v1",
              payload: { room: recovered.room },
            });
          }
          io.to(roomId).emit("message", {
            type: "error",
            version: "v1",
            payload: { code: "GAME_START_FAILED", message },
          });
        })
        .finally(async () => {
          await gameRunLeaseService.release(roomId, ownedLeaseToken).catch(() => undefined);
        });

      res.json(formatRoomResponse(room, difficulty));
    } catch (error) {
      if (leaseToken && !orchestratorScheduled) {
        const roomId = (req.params as Partial<z.infer<typeof roomIdParamsSchema>>).roomId;
        if (roomId) {
          await gameRunLeaseService.release(roomId, leaseToken).catch(() => undefined);
        }
      }
      next(error);
    }
  }
);

roomsRouter.post(
  "/:roomId/leave",
  requireAuth,
  validate({ params: roomIdParamsSchema }),
  async (req, res, next) => {
    try {
      const userId = getAuthenticatedUserId(req.jwtClaims?.sub);
      const { roomId } = req.params as z.infer<typeof roomIdParamsSchema>;
      const result = await roomService.leaveRoom(roomId, userId);

      res.json(formatLeaveResponse(result));
    } catch (error) {
      next(error);
    }
  }
);
