import type { Server } from "socket.io";

import { prisma } from "../models/prismaClient";
import { BadRequestError, ForbiddenError, NotFoundError } from "../utils/errors";
import { generateId } from "../utils/ulid";
import { logger } from "../utils/logger";
import { redisService } from "./RedisService";

export const POWERUP_CODES = [
  "DOUBLE_DOWN",
  "FIFTY_FIFTY",
  "TIME_FREEZE",
  "TIME_BOOST",
  "SHIELD",
  "SABOTAGE",
  "REVEAL",
  "REVEAL_WRONG",
  "SECOND_CHANCE",
] as const;

export type PowerUpCode = (typeof POWERUP_CODES)[number];

const POWERUP_STATE_TTL_SECONDS = 2 * 60 * 60;

const usedKey = (roomId: string, userId: string, powerUpId: string) =>
  `powerup:${roomId}:${userId}:${powerUpId}:used`;
const timeBoostKey = (roomId: string, userId: string) => `powerup:${roomId}:${userId}:time_boost`;
const doubleDownKey = (roomId: string, userId: string) => `powerup:${roomId}:${userId}:double_down`;
const sabotageKey = (roomId: string, userId: string) => `powerup:${roomId}:${userId}:sabotaged`;
const revivedKey = (roomId: string, userId: string) => `powerup:${roomId}:${userId}:revived`;
const shieldSetKey = (roomId: string) => `powerup:${roomId}:shielded`;

export interface PowerUpActivationInput {
  roomId: string;
  userId: string;
  powerUpId: string;
  targetPlayerId?: string;
  roundId?: string;
  questionOptions?: readonly string[];
  correctAnswerIndex?: number;
}

export interface PowerUpActivationResult {
  roomId: string;
  userId: string;
  powerUpId: string;
  code: PowerUpCode;
  publicEffect: Record<string, unknown>;
  privateEffect?: Record<string, unknown>;
}

export function normalizePowerUpCode(code: string): PowerUpCode {
  const normalized = code.toUpperCase();
  if (!(POWERUP_CODES as readonly string[]).includes(normalized)) {
    throw new BadRequestError(`Unsupported power-up code: ${code}`);
  }
  return normalized as PowerUpCode;
}

export function selectWrongAnswerIndices(
  correctAnswerIndex: number,
  count: number,
  random: () => number = Math.random,
): number[] {
  if (!Number.isInteger(correctAnswerIndex) || correctAnswerIndex < 0 || correctAnswerIndex > 3) {
    throw new BadRequestError("correctAnswerIndex must be between 0 and 3");
  }

  const wrongIndices = [0, 1, 2, 3].filter((index) => index !== correctAnswerIndex);
  for (let index = wrongIndices.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [wrongIndices[index], wrongIndices[swapIndex]] = [wrongIndices[swapIndex], wrongIndices[index]];
  }

  return wrongIndices.slice(0, Math.min(count, wrongIndices.length));
}

export class PowerUpService {
  async activatePowerUp(
    input: PowerUpActivationInput,
    io?: Server,
  ): Promise<PowerUpActivationResult> {
    if (!redisService) {
      throw new Error("Redis unavailable; power-up activation cannot be gated safely");
    }

    const powerUp = await prisma.powerUp.findFirst({
      where: {
        OR: [{ id: input.powerUpId }, { code: input.powerUpId }],
        isActive: true,
      },
      select: { id: true, code: true },
    });
    if (!powerUp) {
      throw new NotFoundError("Power-up not found");
    }

    const code = normalizePowerUpCode(powerUp.code);
    const used = await redisService.setnx(
      usedKey(input.roomId, input.userId, powerUp.id),
      "1",
      POWERUP_STATE_TTL_SECONDS,
    );
    if (!used) {
      throw new ForbiddenError("Power-up already used in this room");
    }

    const inventory = await prisma.playerPowerUp.findUnique({
      where: {
        userId_powerUpId: {
          userId: input.userId,
          powerUpId: powerUp.id,
        },
      },
      select: { quantity: true },
    });
    if (!inventory || inventory.quantity < 1) {
      await redisService.del(usedKey(input.roomId, input.userId, powerUp.id));
      throw new ForbiddenError("Power-up is not available in inventory");
    }

    await prisma.$transaction([
      prisma.playerPowerUp.update({
        where: {
          userId_powerUpId: {
            userId: input.userId,
            powerUpId: powerUp.id,
          },
        },
        data: { quantity: { decrement: 1 } },
      }),
      prisma.powerUpUse.create({
        data: {
          id: generateId(),
          roomId: input.roomId,
          roundId: input.roundId ?? null,
          userId: input.userId,
          powerUpId: powerUp.id,
          targetPlayerId: input.targetPlayerId ?? null,
        },
      }),
    ]);

    const result = await this.applyEffect({ ...input, powerUpId: powerUp.id }, code, io);

    logger.info("Power-up activated", {
      roomId: input.roomId,
      userId: input.userId,
      powerUpId: powerUp.id,
      code,
    });

    return result;
  }

  async getShieldedPlayers(roomId: string): Promise<string[]> {
    return redisService ? redisService.smembers(shieldSetKey(roomId)) : [];
  }

  async consumeShield(roomId: string, userId: string): Promise<void> {
    if (redisService) {
      await redisService.srem(shieldSetKey(roomId), userId);
    }
  }

  async getTimeBoostMs(roomId: string, userId: string): Promise<number> {
    if (!redisService) {
      return 0;
    }
    const value = await redisService.get(timeBoostKey(roomId, userId));
    return value ? Number.parseInt(value, 10) || 0 : 0;
  }

  async consumeTimeBoost(roomId: string, userId: string): Promise<void> {
    if (redisService) {
      await redisService.del(timeBoostKey(roomId, userId));
    }
  }

  async consumeScoreMultiplier(roomId: string, userId: string): Promise<number> {
    if (!redisService) {
      return 1;
    }
    const value = await redisService.get(doubleDownKey(roomId, userId));
    if (!value) {
      return 1;
    }
    await redisService.del(doubleDownKey(roomId, userId));
    return Number.parseFloat(value) || 1;
  }

  async consumeSabotage(roomId: string, userId: string): Promise<boolean> {
    if (!redisService) {
      return false;
    }
    const key = sabotageKey(roomId, userId);
    const value = await redisService.get(key);
    if (!value) {
      return false;
    }
    await redisService.del(key);
    return true;
  }

  private async applyEffect(
    input: PowerUpActivationInput,
    code: PowerUpCode,
    io?: Server,
  ): Promise<PowerUpActivationResult> {
    switch (code) {
      case "DOUBLE_DOWN":
        await redisService!.set(doubleDownKey(input.roomId, input.userId), "2", POWERUP_STATE_TTL_SECONDS);
        return this.result(input, code, { type: code, targetPlayerId: input.userId });

      case "FIFTY_FIFTY": {
        const correctAnswerIndex = this.requireCorrectAnswerIndex(input.correctAnswerIndex);
        const maskedAnswerIndices = selectWrongAnswerIndices(correctAnswerIndex, 2);
        return this.result(
          input,
          code,
          { type: code, targetPlayerId: input.userId },
          { type: code, maskedAnswerIndices },
        );
      }

      case "TIME_FREEZE":
      case "TIME_BOOST": {
        const extraMs = 5_000;
        await redisService!.set(timeBoostKey(input.roomId, input.userId), String(extraMs), POWERUP_STATE_TTL_SECONDS);
        await redisService!.publish(
          `game:${input.roomId}:events`,
          JSON.stringify({ type: "TIME_BOOST", userId: input.userId, extraMs }),
        );
        return this.result(input, code, { type: code, targetPlayerId: input.userId, extraMs });
      }

      case "SHIELD":
        await redisService!.sadd(shieldSetKey(input.roomId), input.userId);
        await redisService!.expire(shieldSetKey(input.roomId), POWERUP_STATE_TTL_SECONDS);
        return this.result(input, code, { type: code, targetPlayerId: input.userId });

      case "SABOTAGE": {
        if (!input.targetPlayerId) {
          throw new BadRequestError("SABOTAGE requires targetPlayerId");
        }
        await redisService!.set(
          sabotageKey(input.roomId, input.targetPlayerId),
          "1",
          POWERUP_STATE_TTL_SECONDS,
        );
        return this.result(input, code, { type: code, targetPlayerId: input.targetPlayerId });
      }

      case "REVEAL":
      case "REVEAL_WRONG": {
        const correctAnswerIndex = this.requireCorrectAnswerIndex(input.correctAnswerIndex);
        const [revealedAnswerIndex] = selectWrongAnswerIndices(correctAnswerIndex, 1, () => 0);
        const revealedAnswer =
          input.questionOptions && revealedAnswerIndex !== undefined
            ? input.questionOptions[revealedAnswerIndex]
            : undefined;
        const publicEffect = { type: code, revealedAnswerIndex, revealedAnswer };
        if (io) {
          io.to(input.roomId).emit("message", {
            type: "powerup:effect",
            version: "v1",
            payload: {
              roomId: input.roomId,
              powerUpId: input.powerUpId,
              userId: input.userId,
              effect: publicEffect,
            },
          });
        }
        return this.result(input, code, publicEffect);
      }

      case "SECOND_CHANCE": {
        const alreadyRevived = await redisService!.setnx(
          revivedKey(input.roomId, input.userId),
          "1",
          POWERUP_STATE_TTL_SECONDS,
        );
        if (!alreadyRevived) {
          throw new ForbiddenError("Second Chance has already been used in this room");
        }

        const roomPlayer = await prisma.roomPlayer.findUnique({
          where: { roomId_userId: { roomId: input.roomId, userId: input.userId } },
          select: { isEliminated: true },
        });
        if (!roomPlayer) {
          throw new NotFoundError("Player is not in this room");
        }
        if (!roomPlayer.isEliminated) {
          throw new BadRequestError("Second Chance can only revive an eliminated player");
        }

        await prisma.roomPlayer.update({
          where: { roomId_userId: { roomId: input.roomId, userId: input.userId } },
          data: { isEliminated: false, eliminatedAt: null },
        });
        await redisService!.sadd(`room:${input.roomId}:players`, input.userId);

        return this.result(input, code, { type: code, revivedPlayerId: input.userId });
      }
    }
  }

  private result(
    input: PowerUpActivationInput,
    code: PowerUpCode,
    publicEffect: Record<string, unknown>,
    privateEffect?: Record<string, unknown>,
  ): PowerUpActivationResult {
    return {
      roomId: input.roomId,
      userId: input.userId,
      powerUpId: input.powerUpId,
      code,
      publicEffect,
      privateEffect,
    };
  }

  private requireCorrectAnswerIndex(value: number | undefined): number {
    if (value == null) {
      throw new BadRequestError("Power-up requires an active question");
    }
    return value;
  }
}

export const powerUpService = new PowerUpService();
