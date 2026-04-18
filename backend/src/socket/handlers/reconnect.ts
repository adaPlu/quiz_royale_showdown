/**
 * Handler: v1:request_reconnect
 *
 * Loads game state from Redis for the roomId and re-emits the appropriate
 * state events to the reconnecting socket only.
 */

import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { redisService } from "../../services/RedisService";
import { logger } from "../../utils/logger";
import type { GameStateSnapshot } from "../../game/GameStateMachine";

const reconnectSchema = z.object({
  roomId: z.string().min(1),
});

export function registerReconnectHandler(io: Server, socket: Socket): void {
  socket.on("v1:request_reconnect", async (payload: unknown) => {
    const parsed = reconnectSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit("v1:error", {
        code: "VALIDATION_ERROR",
        message: "Invalid payload for v1:request_reconnect",
      });
      return;
    }

    const { roomId } = parsed.data;
    const userId = socket.data.userId as string;

    try {
      if (!redisService) {
        throw new Error("Redis unavailable");
      }

      // Load GameStateMachine context from Redis
      const stateRaw = await redisService.getJson<GameStateSnapshot>(
        `game:${roomId}:state`
      );

      if (!stateRaw) {
        socket.emit("v1:error", {
          code: "ROOM_NOT_FOUND",
          message: `No active game found for room ${roomId}`,
        });
        return;
      }

      // Game must be active (not GAME_OVER or WAITING)
      const terminalPhases = ["GAME_OVER", "WAITING"];
      if (terminalPhases.includes(stateRaw.phase)) {
        socket.emit("v1:error", {
          code: "GAME_NOT_ACTIVE",
          message: "The game in this room is not currently active",
        });
        return;
      }

      logger.info("Player reconnecting", { userId, roomId, phase: stateRaw.phase });

      // Re-join the Socket.IO room
      await socket.join(roomId);

      // Load scores
      const scoreEntries = await redisService.zrevrangeWithScores(
        `room:${roomId}:scores`,
        0,
        -1
      );
      const scores = Object.fromEntries(
        scoreEntries.map(({ member, score }) => [member, score])
      );

      // Load player list from Redis set
      const playerIds = await redisService.smembers(`room:${roomId}:players`);

      const players = playerIds.map((pid) => ({
        id: pid,
        score: scores[pid] ?? 0,
        isEliminated: stateRaw.eliminatedPlayerIds.includes(pid),
      }));

      // Emit current room state to reconnecting socket only
      socket.emit("v1:room_state", {
        roomId,
        phase: stateRaw.phase,
        round: stateRaw.round,
        players,
        finalists: stateRaw.finalists,
        eliminatedPlayerIds: stateRaw.eliminatedPlayerIds,
      });

      // If in QUESTION_ACTIVE or FINALE, re-emit question with remaining time
      if (stateRaw.phase === "QUESTION_ACTIVE" || stateRaw.phase === "FINALE") {
        const questionCtx = await redisService.getJson<{
          questionId: string;
          prompt: string;
          options: string[];
          startTs: number;
          timeLimitMs: number;
        }>(`game:${roomId}:current_question`);

        if (questionCtx) {
          const elapsed = Date.now() - questionCtx.startTs;
          const remainingMs = Math.max(0, questionCtx.timeLimitMs - elapsed);

          socket.emit("v1:question", {
            roomId,
            questionId: questionCtx.questionId,
            prompt: questionCtx.prompt,
            options: questionCtx.options,
            timeLimitMs: questionCtx.timeLimitMs,
            remainingMs,
            startTs: questionCtx.startTs,
          });
        }
      }
    } catch (err) {
      logger.error("Error in reconnect handler", {
        userId,
        roomId,
        message: err instanceof Error ? err.message : String(err),
      });
      socket.emit("v1:error", {
        code: "INTERNAL_ERROR",
        message: "Failed to process reconnect",
      });
    }
  });
}
