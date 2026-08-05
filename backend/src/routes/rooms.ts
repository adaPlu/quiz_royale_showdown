import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { prisma } from "../models/prismaClient";
import { gameOrchestrator } from "../services/GameOrchestrator";
import {
  LeaveRoomResult,
  RoomLifecycleState,
  roomService,
} from "../services/RoomService";
import { getIo } from "../socket";
import { ForbiddenError, UnauthorizedError } from "../utils/errors";
import { isAutomatedTestUser } from "../utils/testUsers";
import { isValidId } from "../utils/ulid";

export const roomsRouter = Router();

const createRoomSchema = z.object({
  isPrivate: z.boolean().optional().default(true),
  maxPlayers: z.number().int().min(2).max(100).optional().default(8),
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

function getAuthenticatedUserId(jwtSub?: string): string {
  if (!jwtSub) {
    throw new UnauthorizedError("Missing authenticated user");
  }

  return jwtSub;
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

function formatRoomResponse(payload: RoomLifecycleState, wsToken?: string) {
  return {
    roomId: payload.room.roomId,
    roomCode: payload.room.code,
    room: payload.room,
    hostUserId: payload.hostUserId,
    config: payload.config,
    createdAt: payload.createdAt,
    startedAt: payload.startedAt,
    ...(wsToken ? { wsToken } : {}),
  };
}

function formatRoomLookupResponse(payload: RoomLifecycleState, requesterId: string) {
  const isRoomParticipant =
    payload.hostUserId === requesterId ||
    payload.room.players.some((player) => player.id === requesterId);

  if (isRoomParticipant) {
    return formatRoomResponse(payload);
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
      const room = await roomService.createRoom(hostUserId, input);

      res.status(201).json(formatRoomResponse(room));
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

      await assertTestRoomBoundary(userId, roomCode);

      const { room, wsToken } = await roomService.joinRoom(userId, roomCode);
      const lifecycleState = await roomService.getRoomById(room.id);

      res.json(formatRoomResponse(lifecycleState, wsToken));
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

      res.json(formatRoomLookupResponse(room, requesterId));
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
    try {
      const requesterId = getAuthenticatedUserId(req.jwtClaims?.sub);
      const { roomId } = req.params as z.infer<typeof roomIdParamsSchema>;
      const { allowSolo } = req.body as z.infer<typeof startRoomSchema>;

      await roomService.recoverStaleCountdown(
        roomId,
        gameOrchestrator.hasActiveGame(roomId)
      );

      const room = await roomService.startGame(roomId, requesterId, { allowSolo });

      try {
        await gameOrchestrator.assertQuestionBankReady();
      } catch (error) {
        await roomService.resetStartFailure(
          roomId,
          error instanceof Error ? error.message : String(error)
        );
        throw error;
      }

      // Fetch player IDs and fire the game loop asynchronously.
      // Do NOT await — the FSM drives itself over socket events.
      const playerRows = await prisma.roomPlayer.findMany({
        where: { roomId },
        select: { userId: true },
      });
      const playerIds = playerRows.map((row) => row.userId);

      void gameOrchestrator.startGame(roomId, playerIds, getIo()).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        // Logger is imported transitively via RoomService; use console as fallback here.
        console.error("[rooms] GameOrchestrator.startGame failed", { roomId, message });
      });

      res.json(formatRoomResponse(room));
    } catch (error) {
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
