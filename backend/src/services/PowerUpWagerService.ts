import { Prisma } from "@prisma/client";

import { prisma } from "../models/prismaClient";
import { BadRequestError, ForbiddenError, NotFoundError } from "../utils/errors";
import { generateId } from "../utils/ulid";

export interface PowerUpWagerPayout {
  userId: string;
  powerUpId: string;
  quantity: number;
}

export interface PowerUpWagerSettlement {
  poolSize: number;
  winnerIds: string[];
  payouts: PowerUpWagerPayout[];
}

export class PowerUpWagerService {
  async placeWager(input: {
    roomId: string;
    roundId: string;
    userId: string;
    powerUpId: string;
  }): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const round = await tx.round.findUnique({
        where: { id: input.roundId },
        select: { roomId: true, lockedAt: true, resolvedAt: true },
      });

      if (!round || round.roomId !== input.roomId) {
        throw new NotFoundError("Active round not found");
      }
      if (round.lockedAt || round.resolvedAt) {
        throw new BadRequestError("Power-up wagers are closed for this round");
      }

      const participant = await tx.roomPlayer.findUnique({
        where: {
          roomId_userId: {
            roomId: input.roomId,
            userId: input.userId,
          },
        },
        select: { id: true, isEliminated: true },
      });
      if (!participant || participant.isEliminated) {
        throw new ForbiddenError("Only active room players can wager power-ups");
      }

      const powerUp = await tx.powerUp.findFirst({
        where: { id: input.powerUpId, isActive: true },
        select: { id: true },
      });
      if (!powerUp) {
        throw new NotFoundError("Power-up not found");
      }

      const existing = await tx.powerUpBet.findUnique({
        where: {
          roundId_userId: {
            roundId: input.roundId,
            userId: input.userId,
          },
        },
        select: { id: true },
      });
      if (existing) {
        throw new BadRequestError("Only one power-up may be wagered per answer");
      }

      const inventoryUpdate = await tx.playerPowerUp.updateMany({
        where: {
          userId: input.userId,
          powerUpId: input.powerUpId,
          quantity: { gt: 0 },
        },
        data: { quantity: { decrement: 1 } },
      });
      if (inventoryUpdate.count !== 1) {
        throw new ForbiddenError("The selected power-up is not available in inventory");
      }

      await tx.powerUpBet.create({
        data: {
          id: generateId(),
          roomId: input.roomId,
          roundId: input.roundId,
          userId: input.userId,
          powerUpId: input.powerUpId,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async refundWager(roundId: string, userId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const bet = await tx.powerUpBet.findUnique({
        where: { roundId_userId: { roundId, userId } },
      });
      if (!bet || bet.status !== "PLACED") return;

      await tx.playerPowerUp.upsert({
        where: {
          userId_powerUpId: {
            userId: bet.userId,
            powerUpId: bet.powerUpId,
          },
        },
        create: {
          id: generateId(),
          userId: bet.userId,
          powerUpId: bet.powerUpId,
          quantity: bet.quantity,
        },
        update: { quantity: { increment: bet.quantity } },
      });

      await tx.powerUpBet.update({
        where: { id: bet.id },
        data: { status: "REFUNDED", settledAt: new Date() },
      });
    });
  }

  async settleRoundWagers(
    roundId: string,
    correctPlayerIds: string[],
  ): Promise<PowerUpWagerSettlement> {
    return prisma.$transaction(async (tx) => {
      const bets = await tx.powerUpBet.findMany({
        where: { roundId, status: "PLACED" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      if (bets.length === 0) {
        return { poolSize: 0, winnerIds: [], payouts: [] };
      }

      const correctSet = new Set(correctPlayerIds);
      const winnerIds = [...new Set(
        bets.filter((bet) => correctSet.has(bet.userId)).map((bet) => bet.userId),
      )].sort();
      const settledAt = new Date();

      if (winnerIds.length === 0) {
        await tx.powerUpBet.updateMany({
          where: { roundId, status: "PLACED" },
          data: { status: "LOST", settledAt },
        });
        return { poolSize: bets.length, winnerIds: [], payouts: [] };
      }

      const poolByPowerUp = new Map<string, number>();
      for (const bet of bets) {
        poolByPowerUp.set(
          bet.powerUpId,
          (poolByPowerUp.get(bet.powerUpId) ?? 0) + bet.quantity,
        );
      }

      const payoutMap = new Map<string, number>();
      for (const [powerUpId, quantity] of [...poolByPowerUp.entries()].sort()) {
        for (let index = 0; index < quantity; index += 1) {
          const userId = winnerIds[index % winnerIds.length];
          const key = `${userId}:${powerUpId}`;
          payoutMap.set(key, (payoutMap.get(key) ?? 0) + 1);
        }
      }

      const payouts: PowerUpWagerPayout[] = [];
      const payoutCountByUser = new Map<string, number>();
      for (const [key, quantity] of payoutMap) {
        const separator = key.indexOf(":");
        const userId = key.slice(0, separator);
        const powerUpId = key.slice(separator + 1);

        await tx.playerPowerUp.upsert({
          where: { userId_powerUpId: { userId, powerUpId } },
          create: {
            id: generateId(),
            userId,
            powerUpId,
            quantity,
          },
          update: { quantity: { increment: quantity } },
        });

        payouts.push({ userId, powerUpId, quantity });
        payoutCountByUser.set(userId, (payoutCountByUser.get(userId) ?? 0) + quantity);
      }

      await tx.powerUpBet.updateMany({
        where: {
          roundId,
          status: "PLACED",
          userId: { notIn: winnerIds },
        },
        data: { status: "LOST", settledAt },
      });

      for (const winnerId of winnerIds) {
        await tx.powerUpBet.updateMany({
          where: { roundId, userId: winnerId, status: "PLACED" },
          data: {
            status: "WON",
            payoutQuantity: payoutCountByUser.get(winnerId) ?? 0,
            settledAt,
          },
        });
      }

      return {
        poolSize: bets.reduce((sum, bet) => sum + bet.quantity, 0),
        winnerIds,
        payouts: payouts.sort((left, right) =>
          left.userId.localeCompare(right.userId) ||
          left.powerUpId.localeCompare(right.powerUpId),
        ),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

export const powerUpWagerService = new PowerUpWagerService();
