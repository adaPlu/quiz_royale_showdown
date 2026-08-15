import { beforeEach, describe, expect, it, vi } from "vitest";

const txMock = vi.hoisted(() => ({
  userSeasonPassClaim: { create: vi.fn() },
  userCosmetic: { upsert: vi.fn() },
  playerPowerUp: { upsert: vi.fn() },
}));

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  seasonPassTier: { findUnique: vi.fn() },
  userSeasonPass: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
}));

vi.mock("../../models/prismaClient", () => ({ prisma: prismaMock }));
vi.mock("../../utils/ulid", () => ({ generateId: () => "generated-id" }));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const freeTier = {
  id: "tier-1", tier: 1, track: "FREE", cosmeticId: "cos-1", powerUpId: null,
  powerUpQuantity: 0, seasonPassId: "pass-1", seasonPass: { xpPerTier: 100 },
};
const premiumTier = { ...freeTier, id: "tier-2", track: "PREMIUM" };

describe("SeasonPassService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock),
    );
  });

  // The product decision: refunding revokes ACCESS, not rewards already earned.
  describe("premium entitlement (PREMIUM-PURCHASE)", () => {
    it("revoking only flips entitlement and never deletes claims", async () => {
      const { seasonPassService } = await import("../SeasonPassService");
      prismaMock.userSeasonPass.updateMany.mockResolvedValue({ count: 1 });

      await seasonPassService.revokePremiumForReceipt("receipt-1");

      expect(prismaMock.userSeasonPass.updateMany).toHaveBeenCalledWith({
        where: { premiumReceiptId: "receipt-1", entitlement: "ACTIVE" },
        data: { entitlement: "REVOKED" },
      });
      // No claim deletion anywhere — that is the whole point of the design.
      expect(txMock.userSeasonPassClaim.create).not.toHaveBeenCalled();
    });

    it("locks PREMIUM tiers once entitlement is REVOKED", async () => {
      const { seasonPassService } = await import("../SeasonPassService");
      prismaMock.seasonPassTier.findUnique.mockResolvedValue(premiumTier);
      prismaMock.userSeasonPass.findUnique.mockResolvedValue({
        id: "up-1", entitlement: "REVOKED", earnedXp: 100_000,
      });

      await expect(seasonPassService.claimTier("user-1", "tier-2")).rejects.toThrow(
        /Premium track is not active/i,
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("still allows FREE tiers after revocation", async () => {
      const { seasonPassService } = await import("../SeasonPassService");
      prismaMock.seasonPassTier.findUnique.mockResolvedValue(freeTier);
      prismaMock.userSeasonPass.findUnique.mockResolvedValue({
        id: "up-1", entitlement: "REVOKED", earnedXp: 500,
      });

      const result = await seasonPassService.claimTier("user-1", "tier-1");

      expect(result.alreadyClaimed).toBe(false);
      expect(txMock.userCosmetic.upsert).toHaveBeenCalled();
    });
  });

  describe("claim idempotency", () => {
    it("does not grant twice when the claim already exists", async () => {
      const { seasonPassService } = await import("../SeasonPassService");
      const { Prisma } = await import("@prisma/client");
      prismaMock.seasonPassTier.findUnique.mockResolvedValue(freeTier);
      prismaMock.userSeasonPass.findUnique.mockResolvedValue({
        id: "up-1", entitlement: "ACTIVE", earnedXp: 500,
      });
      prismaMock.$transaction.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "6" }),
      );

      const result = await seasonPassService.claimTier("user-1", "tier-1");

      expect(result.alreadyClaimed).toBe(true);
      expect(txMock.userCosmetic.upsert).not.toHaveBeenCalled();
    });

    it("rejects a tier the player has not reached", async () => {
      const { seasonPassService } = await import("../SeasonPassService");
      prismaMock.seasonPassTier.findUnique.mockResolvedValue({ ...freeTier, tier: 9 });
      prismaMock.userSeasonPass.findUnique.mockResolvedValue({
        id: "up-1", entitlement: "ACTIVE", earnedXp: 100, // 1 tier earned, needs 9
      });

      await expect(seasonPassService.claimTier("user-1", "tier-1")).rejects.toThrow(
        /has not been reached/i,
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("progression (PASS-PROGRESSION)", () => {
    it("increments rather than overwriting", async () => {
      const { seasonPassService } = await import("../SeasonPassService");
      prismaMock.userSeasonPass.upsert.mockResolvedValue({});

      await seasonPassService.addPassXp("user-1", "pass-1", 50);

      expect(prismaMock.userSeasonPass.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { earnedXp: { increment: 50 } } }),
      );
    });

    it("ignores non-positive awards without touching the database", async () => {
      const { seasonPassService } = await import("../SeasonPassService");
      await seasonPassService.addPassXp("user-1", "pass-1", 0);
      expect(prismaMock.userSeasonPass.upsert).not.toHaveBeenCalled();
    });
  });
});

// Settlement wiring: pass XP must ride the settlement transaction, not a
// separate one, so a rolled-back settlement cannot leave orphaned progression.
describe("addPassXp — transaction client (settlement wiring)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the supplied transaction client instead of the top-level prisma", async () => {
    const { seasonPassService } = await import("../SeasonPassService");
    const txClient = { userSeasonPass: { upsert: vi.fn().mockResolvedValue({}) } };

    await seasonPassService.addPassXp("user-1", "pass-1", 40, txClient as never);

    expect(txClient.userSeasonPass.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { earnedXp: { increment: 40 } } }),
    );
    // Must NOT open its own transaction — that would escape the caller's
    // rollback and is the bug this test exists to prevent.
    expect(prismaMock.userSeasonPass.upsert).not.toHaveBeenCalled();
  });
});
