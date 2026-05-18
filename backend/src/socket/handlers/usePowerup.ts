import type { Server } from "socket.io";
import { z } from "zod";
import { prisma } from "../../models/prismaClient";
import { redisService } from "../../services/RedisService";
import { powerUpService } from "../../services/PowerUpService";
import type { SocketErrorEvent } from "../../types/contracts";
import { AppError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import type { AuthenticatedSocket } from "../middleware";

const activatePowerupSchema = z.object({
  roomId: z.string().min(1),
  powerUpId: z.string().min(1).optional(),
  powerUpCode: z.string().min(1).optional(),
  id: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  targetPlayerId: z.string().min(1).optional(),
  roundId: z.string().min(1).optional(),
}).superRefine((payload, ctx) => {
  if (!payload.powerUpId && !payload.powerUpCode && !payload.id && !payload.code) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "One of powerUpId, powerUpCode, id, or code is required",
      path: ["powerUpId"],
    });
  }
});

type ActiveQuestionContext = {
  roundId?: string;
  answers?: string[];
  questionOptions?: string[];
  correctIndex?: number;
  correctAnswerIndex?: number;
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

const powerUpIdentifier = (payload: z.infer<typeof activatePowerupSchema>): string =>
  payload.powerUpId ?? payload.powerUpCode ?? payload.id ?? payload.code ?? "";

const socketErrorCode = (error: unknown): string => {
  if (!(error instanceof AppError)) {
    return "INTERNAL_ERROR";
  }

  if (error.name === "NotFoundError") {
    return "POWERUP_NOT_FOUND";
  }

  if (error.name === "ForbiddenError" && /already used/i.test(error.message)) {
    return "POWERUP_ALREADY_USED";
  }

  if (error.name === "ForbiddenError" && /inventory|available/i.test(error.message)) {
    return "POWERUP_UNAVAILABLE";
  }

  return error.code;
};

const socketErrorMessage = (error: unknown): string =>
  error instanceof AppError ? error.message : "Failed to activate power-up";

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

    const { roomId, targetPlayerId } = parsed.data;
    const powerUpId = powerUpIdentifier(parsed.data);
    const userId = socket.data.userId;

    try {
      if (!socket.data.roomId) {
        emitError(socket, "ROOM_NOT_JOINED", "Socket has not joined a room");
        return;
      }

      if (socket.data.roomId !== roomId) {
        emitError(socket, "ROOM_MISMATCH", "Socket is not joined to the requested room");
        return;
      }

      const roomPlayer = await prisma.roomPlayer.findUnique({
        where: { roomId_userId: { roomId, userId } },
        select: { isEliminated: true },
      });
      if (!roomPlayer || roomPlayer.isEliminated) {
        emitError(socket, "ELIMINATED", "You have been eliminated");
        return;
      }

      const questionContext = redisService
        ? await redisService.getJson<ActiveQuestionContext>(`game:${roomId}:current_question`)
        : null;

      const result = await powerUpService.activatePowerUp(
        {
          roomId,
          userId,
          powerUpId,
          targetPlayerId,
          roundId: parsed.data.roundId ?? questionContext?.roundId,
          questionOptions: questionContext?.questionOptions ?? questionContext?.answers,
          correctAnswerIndex: questionContext?.correctAnswerIndex ?? questionContext?.correctIndex,
        },
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
      if (!(error instanceof AppError)) {
        logger.error("Error in usePowerup handler", {
          userId,
          roomId,
          powerUpId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      emitError(socket, socketErrorCode(error), socketErrorMessage(error));
    }
  });
}
