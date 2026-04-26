import type { Server } from "socket.io";
import { z } from "zod";
import { prisma } from "../../models/prismaClient";
import { redisService } from "../../services/RedisService";
import type { SocketErrorEvent } from "../../types/contracts";
import { logger } from "../../utils/logger";
import type { AuthenticatedSocket } from "../middleware";

const activatePowerupSchema = z.object({
  roomId: z.string().min(1),
  powerUpId: z.string().min(1),
  targetPlayerId: z.string().min(1).optional()
});

const POWERUP_TTL_SECONDS = 7200;

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

export function registerUsePowerupHandler(_io: Server, socket: AuthenticatedSocket): void {
  socket.on("message", async (message: unknown) => {
    if (
      !message ||
      typeof message !== "object" ||
      !("type" in message) ||
      (message as { type?: string }).type !== "powerup:activate"
    ) {
      return;
    }

    const parsed = activatePowerupSchema.safeParse(
      (message as { payload?: unknown }).payload
    );
    if (!parsed.success) {
      emitError(socket, "VALIDATION_ERROR", "Invalid payload for powerup:activate", parsed.error.flatten());
      return;
    }

    const { roomId, powerUpId, targetPlayerId } = parsed.data;
    const userId = socket.data.userId;

    try {
      if (!redisService) {
        throw new Error("Redis unavailable");
      }

      if (socket.data.roomId && socket.data.roomId !== roomId) {
        emitError(socket, "ROOM_MISMATCH", "Socket is not joined to the requested room");
        return;
      }

      const powerUp = await prisma.powerUp.findFirst({
        where: { id: powerUpId, isActive: true },
        select: { id: true, code: true }
      });

      if (!powerUp) {
        emitError(socket, "POWERUP_NOT_FOUND", `Power-up ${powerUpId} was not found`);
        return;
      }

      const usedKey = `powerup:${roomId}:${userId}:${powerUp.id}:used`;
      const reserved = await redisService.setnx(usedKey, "1", POWERUP_TTL_SECONDS);
      if (!reserved) {
        emitError(socket, "POWERUP_ALREADY_USED", "This power-up has already been activated in the current game");
        return;
      }

      await redisService.publish(
        `game:${roomId}:events`,
        JSON.stringify({
          type: "POWERUP_ACTIVATED",
          roomId,
          userId,
          powerUpId: powerUp.id,
          powerUpCode: powerUp.code,
          targetPlayerId: targetPlayerId ?? null
        })
      );

      logger.info("Power-up activated", {
        roomId,
        userId,
        powerUpId: powerUp.id,
        powerUpCode: powerUp.code,
        targetPlayerId
      });
    } catch (error) {
      logger.error("Error in usePowerup handler", {
        userId,
        roomId,
        powerUpId,
        message: error instanceof Error ? error.message : String(error)
      });
      emitError(socket, "INTERNAL_ERROR", "Failed to activate power-up");
    }
  });
}
