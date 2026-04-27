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
import { NotFoundError, UnauthorizedError } from "../utils/errors";
import { isValidId } from "../utils/ulid";

export const roomsRouter = Router();

const createRoomSchema = z.object({
  isPrivate: z.boolean().optional().default(true),
  maxPlayers: z.number().int().min(2).max(100).optional().default(8),
});

const joinRoomSchema = z.object({
  roomCode: z
    .string()
    .trim()
    .min(4)
    .max(8)
    .nullable()
    .optional()
    .transform((value) => {
      const normalized = value?.trim().toUpperCase();
      return normalized ? normalized : undefined;
    }),
});

const roomCodeParamsSchema = z.object({
  roomCode: z
    .string()
    .trim()
    .length(6, "roomCode must be exactly 6 characters")
    .transform((value) => value.toUpperCase()),
});

const roomIdParamsSchema = z.object({
  roomId: z.string().trim().refine(isValidId, "roomId must be a valid ULID"),
});

function getAuthenticatedUserId(jwtSub?: string): string {
  if (!jwtSub) {
    throw new UnauthorizedError("Missing authenticated user");
  }

  return jwtSub;
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
  validate({ params: roomCodeParamsSchema }),
  async (req, res, next) => {
    try {
      const { roomCode } = req.params as z.infer<typeof roomCodeParamsSchema>;
      const room = await roomService.getRoomByCode(roomCode);

      res.json(formatRoomResponse(room));
    } catch (error) {
      next(error);
    }
  }
);

roomsRouter.post(
  "/:roomId/start",
  requireAuth,
  validate({ params: roomIdParamsSchema }),
  async (req, res, next) => {
    try {
      const requesterId = getAuthenticatedUserId(req.jwtClaims?.sub);
      const { roomId } = req.params as z.infer<typeof roomIdParamsSchema>;

      await roomService.recoverStaleCountdown(
        roomId,
        gameOrchestrator.hasActiveGame(roomId)
      );

      const room = await roomService.startGame(roomId, requesterId);

      try {
        await gameOrchestrator.assertQuestionBankReady();
      } catch (error) {
        await roomService.resetStartFailure(
          roomId,
          error instanceof Error ? error.message : String(error)
        );
        throw error;
      }

      // Fetch player IDs, optionally wait for a second player (bot fill),
      // then fire the game loop asynchronously.
      // Do NOT await the orchestrator — the FSM drives itself over socket events.
      const playerRows = await prisma.roomPlayer.findMany({
        where: { roomId },
        select: { userId: true },
      });
      const humanPlayerIds = playerRows.map((row) => row.userId);

      // waitForPlayersOrFillBots waits up to 10 s for a second human; injects
      // a QuizBot if none joins in time. Fire-and-forget the whole block.
      void roomService.waitForPlayersOrFillBots(roomId, humanPlayerIds).then((playerIds) =>
        gameOrchestrator.startGame(roomId, playerIds, getIo())
      ).catch((err: unknown) => {
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

// GET /rooms/join/:inviteCode — look up a room by invite code (no auth required)
roomsRouter.get("/join/:inviteCode", async (req, res, next) => {
  try {
    const { inviteCode } = req.params;
    const room = await prisma.room.findFirst({
      where: { inviteCode, status: "WAITING" },
      select: {
        id: true,
        code: true,
        players: { select: { id: true } },
      },
    });

    if (!room) {
      throw new NotFoundError("Room not found or not accepting players");
    }

    res.json({
      roomId: room.id,
      code: room.code,
      playerCount: room.players.length,
    });
  } catch (error) {
    next(error);
  }
});

// POST /rooms/:id/invite — generate an invite code (auth required, host only)
roomsRouter.post(
  "/:roomId/invite",
  requireAuth,
  validate({ params: roomIdParamsSchema }),
  async (req, res, next) => {
    try {
      const userId = getAuthenticatedUserId(req.jwtClaims?.sub);
      const { roomId } = req.params as z.infer<typeof roomIdParamsSchema>;

      const room = await prisma.room.findUnique({
        where: { id: roomId },
        select: { hostUserId: true },
      });

      if (!room) {
        throw new NotFoundError("Room not found");
      }

      if (room.hostUserId !== userId) {
        throw new UnauthorizedError("Only the room host can generate an invite code");
      }

      const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();

      await prisma.room.update({
        where: { id: roomId },
        data: { inviteCode },
      });

      res.json({ inviteCode });
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
