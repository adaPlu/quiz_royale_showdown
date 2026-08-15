import { Prisma } from "@prisma/client";

import { prisma } from "../models/prismaClient";
import { BadRequestError, ForbiddenError, NotFoundError } from "../utils/errors";
import { generateId } from "../utils/ulid";
import { logger } from "../utils/logger";

// Mirrors the house pattern (RoomService.joinRoomPlayer, GameSettlementService).
const PASS_MAX_ATTEMPTS = 3;

function isSerializationConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2034"
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export interface ClaimResult {
  alreadyClaimed: boolean;
  cosmeticId: string | null;
  powerUpId: string | null;
  powerUpQuantity: number;
}

export class SeasonPassService {
  /**
   * PASS-PROGRESSION. Pass XP is stored as a running total on UserSeasonPass
   * rather than recomputed from XpEvent on read.
   *
   * XpEvent is an append-only ledger with no season scoping and no retention
   * policy, and the leaderboard already aggregates it unbounded (a known
   * finding). Deriving tier on every read would put a second unbounded
   * groupBy on the hot path. A running total is O(1) to read, and XpEvent
   * remains the audit trail if the two ever need reconciling.
   *
   * The trade-off, stated plainly: launching a pass mid-season cannot
   * retroactively grant tiers from historical XpEvent rows without a one-off
   * backfill. That is a deliberate choice, not an oversight.
   */
  async addPassXp(
    userId: string,
    seasonPassId: string,
    amount: number,
    client?: Prisma.TransactionClient,
  ): Promise<void> {
    if (amount <= 0) return;

    // When a transaction client is supplied the caller owns atomicity and
    // retries; awarding pass XP in the same transaction as settlement means a
    // rolled-back settlement cannot leave orphaned progression behind.
    if (client) {
      await client.userSeasonPass.upsert({
        where: { seasonPassId_userId: { seasonPassId, userId } },
        create: { id: generateId(), seasonPassId, userId, earnedXp: amount },
        update: { earnedXp: { increment: amount } },
      });
      return;
    }

    for (let attempt = 1; attempt <= PASS_MAX_ATTEMPTS; attempt += 1) {
      try {
        await prisma.userSeasonPass.upsert({
          where: { seasonPassId_userId: { seasonPassId, userId } },
          create: {
            id: generateId(),
            seasonPassId,
            userId,
            earnedXp: amount,
          },
          update: { earnedXp: { increment: amount } },
        });
        return;
      } catch (error) {
        if (isSerializationConflict(error) && attempt < PASS_MAX_ATTEMPTS) continue;
        logger.error("Season pass XP award failed", {
          userId,
          seasonPassId,
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }
  }

  /**
   * Claiming is idempotent via UserSeasonPassClaim's compound unique. A retry
   * after a network failure returns the same reward rather than granting twice.
   *
   * PREMIUM tiers require an ACTIVE entitlement. REVOKED locks future premium
   * tiers while leaving every existing claim row untouched — that asymmetry is
   * the whole point: refunding takes away access, not rewards already earned.
   */
  async claimTier(userId: string, tierId: string): Promise<ClaimResult> {
    const tier = await prisma.seasonPassTier.findUnique({
      where: { id: tierId },
      select: {
        id: true,
        tier: true,
        track: true,
        cosmeticId: true,
        powerUpId: true,
        powerUpQuantity: true,
        seasonPassId: true,
        seasonPass: { select: { xpPerTier: true } },
      },
    });
    if (!tier) throw new NotFoundError("Season pass tier not found");

    const userPass = await prisma.userSeasonPass.findUnique({
      where: { seasonPassId_userId: { seasonPassId: tier.seasonPassId, userId } },
      select: { id: true, entitlement: true, earnedXp: true },
    });
    if (!userPass) throw new NotFoundError("No season pass progress for this user");

    if (tier.track === "PREMIUM" && userPass.entitlement !== "ACTIVE") {
      throw new ForbiddenError("Premium track is not active for this season pass");
    }

    const tiersEarned = Math.floor(userPass.earnedXp / tier.seasonPass.xpPerTier);
    if (tier.tier > tiersEarned) {
      throw new BadRequestError("Tier has not been reached yet");
    }

    try {
      await prisma.$transaction(
        async (tx) => {
          // The unique constraint is the idempotency gate; create it FIRST so a
          // concurrent duplicate loses here rather than after granting.
          await tx.userSeasonPassClaim.create({
            data: { id: generateId(), userSeasonPassId: userPass.id, tierId: tier.id },
          });

          if (tier.cosmeticId) {
            await tx.userCosmetic.upsert({
              where: { userId_cosmeticId: { userId, cosmeticId: tier.cosmeticId } },
              create: { id: generateId(), userId, cosmeticId: tier.cosmeticId },
              update: {},
            });
          } else if (tier.powerUpId) {
            await tx.playerPowerUp.upsert({
              where: { userId_powerUpId: { userId, powerUpId: tier.powerUpId } },
              create: {
                id: generateId(),
                userId,
                powerUpId: tier.powerUpId,
                quantity: tier.powerUpQuantity,
              },
              update: { quantity: { increment: tier.powerUpQuantity } },
            });
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      // Already claimed. Report it rather than granting a second time.
      if (isUniqueConstraintError(error)) {
        return {
          alreadyClaimed: true,
          cosmeticId: tier.cosmeticId,
          powerUpId: tier.powerUpId,
          powerUpQuantity: tier.powerUpQuantity,
        };
      }
      throw error;
    }

    return {
      alreadyClaimed: false,
      cosmeticId: tier.cosmeticId,
      powerUpId: tier.powerUpId,
      powerUpQuantity: tier.powerUpQuantity,
    };
  }

  /**
   * PREMIUM-PURCHASE. Entitlement lives on the pass, not derived from the
   * receipt, so revocation and purchase history stay independent.
   */
  async grantPremium(userId: string, seasonPassId: string, receiptId: string): Promise<void> {
    await prisma.userSeasonPass.upsert({
      where: { seasonPassId_userId: { seasonPassId, userId } },
      create: {
        id: generateId(),
        seasonPassId,
        userId,
        entitlement: "ACTIVE",
        premiumReceiptId: receiptId,
      },
      update: { entitlement: "ACTIVE", premiumReceiptId: receiptId },
    });
  }

  /**
   * Revoking flips entitlement only. Claims are never deleted — a refunded
   * player keeps what they already claimed and loses access to the rest.
   */
  async revokePremiumForReceipt(receiptId: string): Promise<number> {
    const result = await prisma.userSeasonPass.updateMany({
      where: { premiumReceiptId: receiptId, entitlement: "ACTIVE" },
      data: { entitlement: "REVOKED" },
    });

    if (result.count > 0) {
      logger.info("Season pass premium revoked", { receiptId, passes: result.count });
    }
    return result.count;
  }
}

export const seasonPassService = new SeasonPassService();
