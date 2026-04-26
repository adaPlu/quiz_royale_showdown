import type { Server } from "socket.io";
import { z } from "zod";
import { redisService } from "../../services/RedisService";
import { powerUpService } from "../../services/PowerUpService";
import type { SocketErrorEvent } from "../../types/contracts";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import type { AuthenticatedSocket } from "../middleware";

const activatePowerupSchema = z.object({
  roomId: z.string().min(1),
  powerUpId: z.string().min(1),
  targetPlayerId: z.string().min(1).optional(),
  roundId: z.string().min(1).optional(),
});

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

export function registerUsePowerupHandler(io: Server, socket: AuthenticatedSocket): void {
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

    const { roomId, powerUpId, targetPlayerId, roundId } = parsed.data;
    const userId = socket.data.userId;

    try {
      if (socket.data.roomId && socket.data.roomId !== roomId) {
        emitError(socket, "ROOM_MISMATCH", "Socket is not joined to the requested room");
        return;
      }

      // Fetch current question's correctAnswerIndex for FIFTY_FIFTY
      let correctAnswerIndex: number | undefined;
      if (redisService) {
        const q = await redisService.getJson<{ correctIndex?: number; correctAnswerIndex?: number }>(
          `game:${roomId}:current_question`
        );
        if (q) {
          correctAnswerIndex = q.correctAnswerIndex ?? q.correctIndex;
        }
      }

      const result = await powerUpService.activatePowerUp(
        { roomId, userId, powerUpId, targetPlayerId, roundId, correctAnswerIndex },
        io,
      );

      // Broadcast public effect to all room members
      io.to(roomId).emit("message", {
        type: "powerup:effect",
        version: "v1",
        payload: result.publicEffect,
      });

      // Send private effect (e.g. FIFTY_FIFTY masked indices) only to the activating player
      if (result.privateEffect) {
        socket.emit("message", {
          type: "powerup:effect_private",
          version: "v1",
          payload: result.privateEffect,
        });
      }

      logger.info("Power-up activated", {
        roomId,
        userId,
        powerUpId,
        code: result.code,
      });
    } catch (error) {
      if (
        error instanceof ForbiddenError ||
        error instanceof NotFoundError ||
        error instanceof BadRequestError
      ) {
        emitError(socket, "POWERUP_ERROR", error.message);
      } else {
        logger.error("Error in usePowerup handler", {
          userId,
          roomId,
          powerUpId,
          message: error instanceof Error ? error.message : String(error),
        });
        emitError(socket, "INTERNAL_ERROR", "Failed to activate power-up");
      }
    }
  });
}
