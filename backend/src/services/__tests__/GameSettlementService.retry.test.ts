import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  gameWinnerReward: { findMany: vi.fn() },
}));

vi.mock("../../models/prismaClient", () => ({ prisma: prismaMock }));
vi.mock("../../utils/ulid", () => ({ generateId: () => "generated-id" }));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../PowerUpService", () => ({ CANONICAL_PHASE_2_POWERUP_CODES: ["FIFTY_FIFTY"] }));

const input = { roomId: "room-1", winnerIds: [], persistentStandings: [] };

// SETTLE-RETRY. settleGame runs Serializable. Before this, P2002 took the
// idempotent already-settled path and everything else was rethrown — including
// P2034, which means the match never settles: no XP, no rewards, no MMR.
//
// Activating seasons is what makes this fire. The SeasonScore upsert loop is
// unreachable today (nothing sets Room.seasonId), so shipping the season pass
// first would have made launch traffic the first real execution of this path.
describe("settleGame — serialization retry (SETTLE-RETRY)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockReset();
  });

  it("retries a serialization conflict instead of losing the settlement", async () => {
    const { gameSettlementService } = await import("../GameSettlementService");
    const conflict = Object.assign(new Error("write conflict"), { code: "P2034" });

    prismaMock.$transaction
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce([]);

    const result = await gameSettlementService.settleGame(input);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    expect(result.alreadySettled).toBe(false);
  });

  it("rethrows once retries are exhausted rather than silently not settling", async () => {
    const { gameSettlementService } = await import("../GameSettlementService");
    const conflict = Object.assign(new Error("write conflict"), { code: "P2034" });
    prismaMock.$transaction.mockRejectedValue(conflict);

    await expect(gameSettlementService.settleGame(input)).rejects.toMatchObject({
      code: "P2034",
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(3);
  });

  // The retry must not swallow the idempotency path: a second settlement of the
  // same room still has to return the previously-persisted rewards.
  it("still takes the already-settled path on a unique-constraint clash", async () => {
    const { gameSettlementService } = await import("../GameSettlementService");
    const { Prisma } = await import("@prisma/client");
    const dup = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002", clientVersion: "6",
    });

    prismaMock.$transaction.mockRejectedValueOnce(dup);
    prismaMock.gameWinnerReward.findMany.mockResolvedValueOnce([]);

    const result = await gameSettlementService.settleGame(input);

    expect(result.alreadySettled).toBe(true);
    // Not retried — a duplicate is terminal, not transient.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});
