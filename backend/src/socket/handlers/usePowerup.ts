/**
 * Handler: v1:use_powerup
 *
 * Validates power-up type, checks Redis that player hasn't used it this game,
 * and emits effect events. Full mechanical enforcement deferred to Phase 2.
 */

import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { redisService } from "../../services/RedisService";
import { logger } from "../../utils/logger";

const POWERUP_TYPES = ["FIFTY_FIFTY", "SHIELD", "TIME_BOOST", "REVEAL", "SECOND_CHANCE"] as const;
type PowerupType = (typeof POWERUP_TYPES)[number];

const usePowerupSchema = z.object({
  roomId: z.string().min(1),
  type: z.enum(POWERUP_TYPES),
  /** Optional: current question's wrong answer indices (needed for FIFTY_FIFTY masking) */
  wrongIndices: z.array(z.number().int().min(0).max(3)).optional(),
});

const POWERUP_TTL_SECONDS = 7200; // 2 hours (full game session)

function pickTwoRandom<T>(arr: T[]): T[] {
  const copy = [...arr];
  const result: T[] = [];
  for (let i = 0; i < 2 && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return result;
}

export function registerUsePowerupHandler(io: Server, socket: Socket): void {
  socket.on("v1:use_powerup", async (payload: unknown) => {
    const parsed = usePowerupSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit("v1:error", {
        code: "VALIDATION_ERROR",
        message: "Invalid payload for v1:use_powerup",
        issues: parsed.error.flatten(),
      });
      return;
    }

    const { roomId, type, wrongIndices } = parsed.data;
    const userId = socket.data.userId as string;

    try {
      if (!redisService) {
        throw new Error("Redis unavailable");
      }

      // Check if player already used this power-up this game
      const usedKey = `powerup:${roomId}:${userId}:${type}`;
      const alreadyUsed = await redisService.get(usedKey);
      if (alreadyUsed) {
        socket.emit("v1:error", {
          code: "POWERUP_ALREADY_USED",
          message: `You have already used ${type} in this game`,
        });
        return;
      }

      // Mark as used
      await redisService.set(usedKey, "1", POWERUP_TTL_SECONDS);

      logger.info("Power-up used", { userId, roomId, type });

      // Broadcast to room that a power-up was activated
      io.to(roomId).emit("v1:powerup_used", {
        roomId,
        userId,
        type,
        usedAt: new Date().toISOString(),
      });

      // Build targeted effect payload based on type
      let effectPayload: Record<string, unknown> = { type, roomId };

      switch (type as PowerupType) {
        case "FIFTY_FIFTY": {
          // Randomly mask 2 wrong answer indices
          const candidates = wrongIndices ?? [0, 1, 2, 3].filter(() => Math.random() > 0.25);
          const masked = pickTwoRandom(candidates);
          effectPayload = { ...effectPayload, maskedIndices: masked };
          break;
        }

        case "TIME_BOOST": {
          // Signal GameOrchestrator to apply 5-second extension (Phase 2 wires this fully)
          effectPayload = { ...effectPayload, extraMs: 5000 };
          // Publish to game loop channel for crash-recovery aware timer adjustment
          await redisService.publish(
            `game:${roomId}:events`,
            JSON.stringify({ type: "TIME_BOOST", userId, extraMs: 5000 })
          );
          break;
        }

        case "SHIELD":
        case "REVEAL":
        case "SECOND_CHANCE": {
          // Client animates; server enforcement in Phase 2
          effectPayload = { ...effectPayload };
          break;
        }
      }

      // Send targeted effect to the requesting player
      socket.emit("v1:powerup_effect", effectPayload);
    } catch (err) {
      logger.error("Error in usePowerup handler", {
        userId,
        roomId,
        type,
        message: err instanceof Error ? err.message : String(err),
      });
      socket.emit("v1:error", {
        code: "INTERNAL_ERROR",
        message: "Failed to apply power-up",
      });
    }
  });
}
