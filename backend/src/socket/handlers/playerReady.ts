/**
 * Handler: v1:player_ready
 *
 * Marks a player as ready in Redis and, if all players are ready,
 * emits `v1:countdown_start` to the room.
 * Always broadcasts updated `v1:room_state` after a toggle.
 */

import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { redisService } from "../../services/RedisService";
import { prisma } from "../../models/prismaClient";
import { logger } from "../../utils/logger";

const playerReadySchema = z.object({
  roomId: z.string().min(1),
});

const READY_TTL_SECONDS = 3600; // 1 hour

export function registerPlayerReadyHandler(io: Server, socket: Socket): void {
  socket.on("v1:player_ready", async (payload: unknown) => {
    const parsed = playerReadySchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit("v1:error", {
        code: "VALIDATION_ERROR",
        message: "Invalid payload for v1:player_ready",
      });
      return;
    }

    const { roomId } = parsed.data;
    const userId = socket.data.userId as string;

    try {
      if (!redisService) {
        throw new Error("Redis unavailable");
      }

      // Mark this player ready
      const readyKey = `room:${roomId}:player:${userId}:ready`;
      await redisService.set(readyKey, "true", READY_TTL_SECONDS);

      logger.info("Player ready", { userId, roomId });

      // Get all players in room from Prisma
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
          players: {
            include: { user: { select: { id: true, displayName: true } } },
          },
        },
      });

      if (!room) {
        socket.emit("v1:error", {
          code: "ROOM_NOT_FOUND",
          message: `Room ${roomId} not found`,
        });
        return;
      }

      // Check if all non-eliminated players are ready
      const activePlayers = room.players.filter((p) => !p.isEliminated);
      const readyChecks = await Promise.all(
        activePlayers.map(async (p) => {
          const val = await redisService!.get(`room:${roomId}:player:${p.userId}:ready`);
          return val === "true";
        })
      );
      const allReady = activePlayers.length > 0 && readyChecks.every(Boolean);

      // Build room state snapshot
      const scoresRaw = await redisService.hgetall(`room:${roomId}:scores`);
      const players = activePlayers.map((p) => ({
        id: p.userId,
        displayName: p.user.displayName,
        score: scoresRaw[p.userId] !== undefined ? parseInt(scoresRaw[p.userId], 10) : p.score,
        streak: p.streak,
        isEliminated: p.isEliminated,
      }));

      // Broadcast updated room state
      io.to(roomId).emit("v1:room_state", {
        roomId,
        phase: room.status,
        players,
        roundNumber: room.currentRound,
        totalRounds: room.totalRounds,
      });

      if (allReady) {
        logger.info("All players ready — starting countdown", { roomId });
        io.to(roomId).emit("v1:countdown_start", {
          roomId,
          startsInMs: 5000,
        });
      }
    } catch (err) {
      logger.error("Error in playerReady handler", {
        userId,
        roomId,
        message: err instanceof Error ? err.message : String(err),
      });
      socket.emit("v1:error", {
        code: "INTERNAL_ERROR",
        message: "Failed to process player ready",
      });
    }
  });
}
