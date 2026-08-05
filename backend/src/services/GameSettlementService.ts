import { Prisma } from "@prisma/client";

import { prisma } from "../models/prismaClient";
import { generateId } from "../utils/ulid";
import { CANONICAL_PHASE_2_POWERUP_CODES } from "./PowerUpService";

export interface SettlementStanding {
  playerId: string;
  rank: number;
  xpAwarded: number;
}

export interface WinnerPowerUpReward {
  playerId: string;
  powerUpId: string;
  code: string;
  name: string;
  quantity: number;
}

export interface GameSettlementResult {
  alreadySettled: boolean;
  winnerPowerUpRewards: WinnerPowerUpReward[];
}

function stableHash(value: string): number {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export class GameSettlementService {
  async settleGame(input: {
    roomId: string;
    winnerIds: string[];
    persistentStandings: SettlementStanding[];
  }): Promise<GameSettlementResult> {
    try {
      const winnerPowerUpRewards = await prisma.$transaction(async (tx) => {
        await tx.gameSettlement.create({
          data: { id: generateId(), roomId: input.roomId },
        });

        const room = await tx.room.findUnique({
          where: { id: input.roomId },
          select: { seasonId: true },
        });
        if (!room) throw new Error("Room not found while settling game");

        if (room.seasonId) {
          const winnerSet = new Set(input.winnerIds);
          for (const standing of input.persistentStandings) {
            const isWinner = winnerSet.has(standing.playerId);
            const mmrDelta = isWinner ? 25 : Math.max(-10, 10 - standing.rank * 5);
            await tx.seasonScore.upsert({
              where: {
                seasonId_userId: {
                  seasonId: room.seasonId,
                  userId: standing.playerId,
                },
              },
              create: {
                id: generateId(),
                seasonId: room.seasonId,
                userId: standing.playerId,
                mmr: 1000 + mmrDelta,
                wins: isWinner ? 1 : 0,
                gamesPlayed: 1,
              },
              update: {
                mmr: { increment: mmrDelta },
                wins: { increment: isWinner ? 1 : 0 },
                gamesPlayed: { increment: 1 },
              },
            });
          }
        }

        for (const standing of input.persistentStandings) {
          await tx.xpEvent.create({
            data: {
              id: generateId(),
              userId: standing.playerId,
              reason: `GAME_FINISH:${input.roomId}`,
              amount: standing.xpAwarded,
              metadata: { roomId: input.roomId, rank: standing.rank },
            },
          });
        }

        const rewardPool = await tx.powerUp.findMany({
          where: {
            code: { in: [...CANONICAL_PHASE_2_POWERUP_CODES] },
            isActive: true,
          },
          orderBy: { code: "asc" },
          select: { id: true, code: true, name: true },
        });
        if (input.winnerIds.length > 0 && rewardPool.length === 0) {
          throw new Error("No active power-ups are available for winner rewards");
        }

        const rewards: WinnerPowerUpReward[] = [];
        for (const playerId of [...new Set(input.winnerIds)].sort()) {
          const selected = rewardPool[stableHash(`${input.roomId}:${playerId}`) % rewardPool.length];
          await tx.playerPowerUp.upsert({
            where: {
              userId_powerUpId: {
                userId: playerId,
                powerUpId: selected.id,
              },
            },
            create: {
              id: generateId(),
              userId: playerId,
              powerUpId: selected.id,
              quantity: 1,
            },
            update: { quantity: { increment: 1 } },
          });
          await tx.gameWinnerReward.create({
            data: {
              id: generateId(),
              roomId: input.roomId,
              userId: playerId,
              powerUpId: selected.id,
              quantity: 1,
            },
          });
          rewards.push({
            playerId,
            powerUpId: selected.id,
            code: selected.code,
            name: selected.name,
            quantity: 1,
          });
        }

        await tx.room.update({
          where: { id: input.roomId },
          data: { status: "GAME_OVER", finishedAt: new Date() },
        });

        return rewards;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      return { alreadySettled: false, winnerPowerUpRewards };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;

      const existingRewards = await prisma.gameWinnerReward.findMany({
        where: { roomId: input.roomId },
        orderBy: { userId: "asc" },
        include: { powerUp: { select: { code: true, name: true } } },
      });
      return {
        alreadySettled: true,
        winnerPowerUpRewards: existingRewards.map((reward) => ({
          playerId: reward.userId,
          powerUpId: reward.powerUpId,
          code: reward.powerUp.code,
          name: reward.powerUp.name,
          quantity: reward.quantity,
        })),
      };
    }
  }
}

export const gameSettlementService = new GameSettlementService();
