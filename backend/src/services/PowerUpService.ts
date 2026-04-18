/**
 * PowerUpService — validates ownership, applies mechanical effects, and
 * emits the WS envelope for every power-up activation.
 *
 * Effects implemented:
 *  FIFTY_FIFTY   — server picks 2 wrong options to eliminate; emits masked indices
 *  TIME_BOOST    — grants the activating player a personal +5 s window
 *  SHIELD        — marks the player immune to the next elimination round
 *  REVEAL_WRONG  — reveals one wrong answer to ALL players in the room
 *  SECOND_CHANCE — revives an already-eliminated player (once per game)
 */

import type { Server } from "socket.io";
import { prisma } from "../models/prismaClient";
import { redisService } from "./RedisService";
import { generateId } from "../utils/ulid";
import { logger } from "../utils/logger";
import { BadRequestError, ForbiddenError, NotFoundError } from "../utils/errors";

// ─── Constants ────────────────────────────────────────────────────────────────

const POWERUP_STATE_TTL = 7200; // 2 hours (full game session)

export const POWERUP_CODES = [
  "FIFTY_FIFTY",
  "TIME_BOOST",
  "SHIELD",
  "REVEAL_WRONG",
  "SECOND_CHANCE",
] as const;

export type PowerupCode = (typeof POWERUP_CODES)[number];

// ─── Redis key helpers ────────────────────────────────────────────────────────

const usedKey = (roomId: string, userId: string, code: PowerupCode) =>
  `powerup:${roomId}:${userId}:${code}:used`;

const shieldKey = (roomId: string, userId: string) =>
  `powerup:${roomId}:${userId}:shield`;

const timeBoostKey = (roomId: string, userId: string) =>
  `powerup:${roomId}:${userId}:timeboost`;

const revivedKey = (roomId: string, userId: string) =>
  `powerup:${roomId}:${userId}:revived`;

// ─── Activation result ────────────────────────────────────────────────────────

export interface PowerupActivationResult {
  powerupCode: PowerupCode;
  userId: string;
  roomId: string;
  effect: Record<string, unknown>;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class PowerUpService {
  /**
   * Main entry-point.
   * Validates ownership, prevents double-use, applies the effect, and
   * emits `v1:powerup:activated` to the room.
   */
  async activatePowerUp(
    roomId: string,
    userId: string,
    powerupCode: PowerupCode,
    io: Server,
    /** Current round context — required by some effects */
    context: {
      roundId?: string;
      questionOptions?: string[];  // all 4 options for the current question
      correctIndex?: number;       // server-only; used to pick a wrong answer to reveal
    } = {}
  ): Promise<PowerupActivationResult> {
    // 1. Validate the code is known
    if (!(POWERUP_CODES as readonly string[]).includes(powerupCode)) {
      throw new BadRequestError(`Unknown power-up code: ${powerupCode}`);
    }

    // 2. Verify the player owns the power-up (DB check)
    const powerUp = await prisma.powerUp.findFirst({
      where: { code: powerupCode, isActive: true },
    });

    if (!powerUp) {
      throw new NotFoundError(`Power-up ${powerupCode} not found or inactive`);
    }

    const inventory = await prisma.playerPowerUp.findUnique({
      where: { userId_powerUpId: { userId, powerUpId: powerUp.id } },
    });

    if (!inventory || inventory.quantity < 1) {
      throw new ForbiddenError(
        `Player ${userId} does not own power-up ${powerupCode}`
      );
    }

    // 3. Prevent re-use within the same game session
    if (!redisService) {
      throw new Error("Redis unavailable — cannot safely gate power-up use");
    }

    const alreadyUsed = await redisService.get(usedKey(roomId, userId, powerupCode));
    if (alreadyUsed) {
      throw new ForbiddenError(
        `Power-up ${powerupCode} already used in room ${roomId}`
      );
    }

    // 4. Deduct one unit from inventory
    await prisma.playerPowerUp.update({
      where: { userId_powerUpId: { userId, powerUpId: powerUp.id } },
      data: { quantity: { decrement: 1 } },
    });

    // 5. Record use in DB
    await prisma.powerUpUse.create({
      data: {
        id: generateId(),
        roomId,
        roundId: context.roundId ?? null,
        userId,
        powerUpId: powerUp.id,
      },
    });

    // 6. Mark as used in Redis so the same session can't re-trigger it
    await redisService.set(usedKey(roomId, userId, powerupCode), "1", POWERUP_STATE_TTL);

    // 7. Apply mechanical effect
    const effect = await this.applyEffect(
      powerupCode,
      roomId,
      userId,
      context,
      io
    );

    // 8. Broadcast activation envelope to every player in the room
    const ts = Date.now();
    io.to(roomId).emit("v1:powerup:activated", {
      eventType: "v1:powerup:activated",
      roomId,
      senderId: userId,
      ts,
      payload: {
        powerupCode,
        userId,
        effect,
      },
    });

    logger.info("Power-up activated", { roomId, userId, powerupCode, effect });

    return { powerupCode, userId, roomId, effect };
  }

  // ─── Per-type effect implementations ─────────────────────────────────────

  private async applyEffect(
    code: PowerupCode,
    roomId: string,
    userId: string,
    context: {
      questionOptions?: string[];
      correctIndex?: number;
      roundId?: string;
    },
    io: Server
  ): Promise<Record<string, unknown>> {
    switch (code) {
      case "FIFTY_FIFTY":
        return this.applyFiftyFifty(roomId, userId, context, io);

      case "TIME_BOOST":
        return this.applyTimeBoost(roomId, userId, io);

      case "SHIELD":
        return this.applyShield(roomId, userId);

      case "REVEAL_WRONG":
        return this.applyRevealWrong(roomId, userId, context, io);

      case "SECOND_CHANCE":
        return this.applySecondChance(roomId, userId, io);
    }
  }

  /**
   * FIFTY_FIFTY: removes 2 wrong options from the current question.
   * Emits the indices to eliminate directly to the requesting socket's room.
   * (The per-socket targeted emit happens via the caller — here we compute
   * and return the masked indices so the caller / gameHandlers can send it.)
   */
  private async applyFiftyFifty(
    roomId: string,
    userId: string,
    context: { questionOptions?: string[]; correctIndex?: number },
    _io: Server
  ): Promise<Record<string, unknown>> {
    const correctIndex = context.correctIndex ?? -1;

    // Build the pool of wrong indices
    const wrongIndices = [0, 1, 2, 3].filter((i) => i !== correctIndex);

    // Pick 2 at random to mask
    const shuffled = wrongIndices.sort(() => Math.random() - 0.5);
    const maskedIndices = shuffled.slice(0, 2);

    // Persist so game loop knows which indices are hidden for this player
    if (redisService) {
      await redisService.setJson(
        `powerup:${roomId}:${userId}:fiftyfifty`,
        { maskedIndices },
        POWERUP_STATE_TTL
      );
    }

    return { type: "FIFTY_FIFTY", targetUserId: userId, maskedIndices };
  }

  /**
   * TIME_BOOST: adds 5 s to the activating player's personal answer window.
   * Stored in Redis; the answer submission handler checks this key when
   * validating the deadline.
   */
  private async applyTimeBoost(
    roomId: string,
    userId: string,
    _io: Server
  ): Promise<Record<string, unknown>> {
    const extraMs = 5_000;

    if (redisService) {
      const key = timeBoostKey(roomId, userId);
      await redisService.set(key, String(extraMs), POWERUP_STATE_TTL);

      // Publish so the GameOrchestrator's timer loop can react
      await redisService.publish(
        `game:${roomId}:events`,
        JSON.stringify({ type: "TIME_BOOST", userId, extraMs })
      );
    }

    return { type: "TIME_BOOST", targetUserId: userId, extraMs };
  }

  /**
   * SHIELD: next elimination won't apply to this player.
   * Written to Redis; EliminationEngine checks this before evicting.
   */
  private async applyShield(
    roomId: string,
    userId: string
  ): Promise<Record<string, unknown>> {
    if (redisService) {
      await redisService.set(shieldKey(roomId, userId), "1", POWERUP_STATE_TTL);
    }

    return { type: "SHIELD", targetUserId: userId };
  }

  /**
   * REVEAL_WRONG: reveals one wrong answer to ALL players in the room.
   * Chooses the first wrong index deterministically so every client sees
   * the same answer highlighted.
   */
  private async applyRevealWrong(
    roomId: string,
    userId: string,
    context: { questionOptions?: string[]; correctIndex?: number },
    io: Server
  ): Promise<Record<string, unknown>> {
    const correctIndex = context.correctIndex ?? -1;
    const wrongIndices = [0, 1, 2, 3].filter((i) => i !== correctIndex);
    // Pick the first wrong index (stable across clients)
    const revealedIndex = wrongIndices[0] ?? -1;
    const revealedText =
      context.questionOptions && revealedIndex >= 0
        ? context.questionOptions[revealedIndex]
        : null;

    // Also emit a targeted reveal event to ALL room members
    io.to(roomId).emit("v1:powerup:reveal_wrong", {
      eventType: "v1:powerup:reveal_wrong",
      roomId,
      senderId: userId,
      ts: Date.now(),
      payload: { revealedIndex, revealedText },
    });

    return { type: "REVEAL_WRONG", revealedIndex, revealedText };
  }

  /**
   * SECOND_CHANCE: revives an already-eliminated player once per game.
   * The player must have been eliminated (DB flag set) and not already revived.
   */
  private async applySecondChance(
    roomId: string,
    userId: string,
    io: Server
  ): Promise<Record<string, unknown>> {
    if (!redisService) {
      throw new Error("Redis unavailable");
    }

    // Prevent using Second Chance more than once per player per game
    const alreadyRevived = await redisService.get(revivedKey(roomId, userId));
    if (alreadyRevived) {
      throw new ForbiddenError("Second Chance can only be used once per game");
    }

    // The activating player revives themselves
    const roomPlayer = await prisma.roomPlayer.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });

    if (!roomPlayer) {
      throw new NotFoundError(`Player ${userId} not found in room ${roomId}`);
    }

    if (!roomPlayer.isEliminated) {
      throw new BadRequestError("Player is not eliminated — Second Chance cannot be used");
    }

    // Revive
    await prisma.roomPlayer.update({
      where: { roomId_userId: { roomId, userId } },
      data: { isEliminated: false, eliminatedAt: null },
    });

    // Restore to Redis player set
    await redisService.sadd(`room:${roomId}:players`, userId);
    await redisService.set(revivedKey(roomId, userId), "1", POWERUP_STATE_TTL);

    // Notify room of the revival
    io.to(roomId).emit("v1:powerup:second_chance", {
      eventType: "v1:powerup:second_chance",
      roomId,
      senderId: userId,
      ts: Date.now(),
      payload: { revivedPlayerId: userId },
    });

    logger.info("Player revived via Second Chance", { roomId, userId });

    return { type: "SECOND_CHANCE", revivedPlayerId: userId };
  }

  // ─── Query helpers (used by GameOrchestrator / elimination logic) ─────────

  /**
   * Returns the set of player IDs that are currently shielded in a room.
   */
  async getShieldedPlayers(roomId: string): Promise<string[]> {
    if (!redisService) return [];

    // We don't have a single "all shielded" set, so we scan the player set
    const playerIds = await redisService.smembers(`room:${roomId}:players`);
    const shielded: string[] = [];

    await Promise.all(
      playerIds.map(async (pid) => {
        const val = await redisService!.get(shieldKey(roomId, pid));
        if (val) shielded.push(pid);
      })
    );

    return shielded;
  }

  /**
   * Consume a shield after it has protected the player.
   */
  async consumeShield(roomId: string, userId: string): Promise<void> {
    if (redisService) {
      await redisService.del(shieldKey(roomId, userId));
    }
  }

  /**
   * Get the time-boost bonus milliseconds for a player (0 if none).
   */
  async getTimeBoostMs(roomId: string, userId: string): Promise<number> {
    if (!redisService) return 0;
    const val = await redisService.get(timeBoostKey(roomId, userId));
    return val ? parseInt(val, 10) : 0;
  }

  /**
   * Clear the time-boost after it has been applied to an answer window.
   */
  async consumeTimeBoost(roomId: string, userId: string): Promise<void> {
    if (redisService) {
      await redisService.del(timeBoostKey(roomId, userId));
    }
  }
}

export const powerUpService = new PowerUpService();
