import { beforeEach, describe, expect, it, vi } from "vitest";

const txMock = vi.hoisted(() => ({
  powerUpBet: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  playerPowerUp: { upsert: vi.fn() },
}));

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
}));

vi.mock("../../models/prismaClient", () => ({ prisma: prismaMock }));
vi.mock("../../utils/ulid", () => ({ generateId: () => "generated-id" }));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// DATA-12. refundWager credited inventory after a read-only status check, at the
// Postgres default isolation, with no predicate on the write. settleRoundWagers
// (Serializable) could pay out and set WON while this transaction had already
// read PLACED; SSI does not protect a Serializable transaction from a READ
// COMMITTED one, so the unpredicated update overwrote WON with REFUNDED and the
// player kept both the payout and the refund.
describe("refundWager — double-credit prevention (DATA-12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock),
    );
  });

  it("runs at Serializable isolation", async () => {
    const { powerUpWagerService } = await import("../PowerUpWagerService");
    txMock.powerUpBet.findUnique.mockResolvedValue(null);

    await powerUpWagerService.refundWager("round-1", "user-1");

    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "Serializable" }),
    );
  });

  it("predicates the settle write on status PLACED, not on id alone", async () => {
    const { powerUpWagerService } = await import("../PowerUpWagerService");
    txMock.powerUpBet.findUnique.mockResolvedValue({
      id: "bet-1", userId: "user-1", powerUpId: "pu-1", quantity: 2, status: "PLACED",
    });
    txMock.powerUpBet.updateMany.mockResolvedValue({ count: 1 });
    txMock.playerPowerUp.upsert.mockResolvedValue({});

    await powerUpWagerService.refundWager("round-1", "user-1");

    expect(txMock.powerUpBet.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "bet-1", status: "PLACED" }),
      }),
    );
    // Unpredicated update() must be gone — it is what allowed WON -> REFUNDED.
    expect(txMock.powerUpBet.update).not.toHaveBeenCalled();
  });

  it("credits nothing when another transaction settled the bet first", async () => {
    const { powerUpWagerService } = await import("../PowerUpWagerService");
    txMock.powerUpBet.findUnique.mockResolvedValue({
      id: "bet-1", userId: "user-1", powerUpId: "pu-1", quantity: 2, status: "PLACED",
    });
    // The conditional claim matches nothing: settle already moved it off PLACED.
    txMock.powerUpBet.updateMany.mockResolvedValue({ count: 0 });

    await powerUpWagerService.refundWager("round-1", "user-1");

    // This is the double-credit. It must not happen.
    expect(txMock.playerPowerUp.upsert).not.toHaveBeenCalled();
  });
});

// DATA-12a — regression introduced by the DATA-12 fix itself. Raising the
// transaction to Serializable made P2034 possible where READ COMMITTED could
// not produce it. Both call sites (submitAnswer.ts:240, :250) swallow errors
// with `.catch(() => undefined)`, and placeWager has already decremented
// inventory, so an unretried conflict silently destroys the player's power-up.
describe("refundWager — serialization-conflict retry (DATA-12a)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockReset();
  });

  it("retries on P2034 instead of losing the player's power-up", async () => {
    const { powerUpWagerService } = await import("../PowerUpWagerService");
    const conflict = Object.assign(new Error("write conflict"), { code: "P2034" });

    prismaMock.$transaction
      .mockRejectedValueOnce(conflict)
      .mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock));
    txMock.powerUpBet.findUnique.mockResolvedValue({
      id: "bet-1", userId: "user-1", powerUpId: "pu-1", quantity: 1, status: "PLACED",
    });
    txMock.powerUpBet.updateMany.mockResolvedValue({ count: 1 });
    txMock.playerPowerUp.upsert.mockResolvedValue({});

    await powerUpWagerService.refundWager("round-1", "user-1");

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    expect(txMock.playerPowerUp.upsert).toHaveBeenCalledTimes(1);
  });

  it("rethrows after exhausting retries so the failure is not silent", async () => {
    const { powerUpWagerService } = await import("../PowerUpWagerService");
    const conflict = Object.assign(new Error("write conflict"), { code: "P2034" });
    prismaMock.$transaction.mockRejectedValue(conflict);

    await expect(powerUpWagerService.refundWager("round-1", "user-1")).rejects.toMatchObject({
      code: "P2034",
    });
  });

  it("does not retry a non-serialization error", async () => {
    const { powerUpWagerService } = await import("../PowerUpWagerService");
    prismaMock.$transaction.mockRejectedValue(new Error("boom"));

    await expect(powerUpWagerService.refundWager("round-1", "user-1")).rejects.toThrow("boom");
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});
