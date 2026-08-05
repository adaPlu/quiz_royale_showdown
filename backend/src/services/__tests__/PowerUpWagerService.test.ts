import { beforeEach, describe, expect, it, vi } from "vitest";

const txMock = {
  powerUpBet: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  playerPowerUp: {
    upsert: vi.fn(),
  },
};

const prismaMock = {
  $transaction: vi.fn(),
};

vi.mock("../../models/prismaClient", () => ({
  prisma: prismaMock,
}));

vi.mock("../../utils/ulid", () => ({
  generateId: vi.fn(() => "generated-id"),
}));

describe("PowerUpWagerService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock),
    );
    txMock.powerUpBet.updateMany.mockResolvedValue({ count: 1 });
    txMock.playerPowerUp.upsert.mockResolvedValue({});
  });

  it("awards the complete pool to the only correct bettor", async () => {
    txMock.powerUpBet.findMany.mockResolvedValue([
      {
        id: "bet-a",
        roomId: "room-1",
        roundId: "round-1",
        userId: "player-a",
        powerUpId: "shield",
        quantity: 1,
        status: "PLACED",
        payoutQuantity: 0,
        createdAt: new Date("2026-08-05T12:00:00Z"),
        settledAt: null,
      },
      {
        id: "bet-b",
        roomId: "room-1",
        roundId: "round-1",
        userId: "player-b",
        powerUpId: "freeze",
        quantity: 1,
        status: "PLACED",
        payoutQuantity: 0,
        createdAt: new Date("2026-08-05T12:00:01Z"),
        settledAt: null,
      },
      {
        id: "bet-c",
        roomId: "room-1",
        roundId: "round-1",
        userId: "player-c",
        powerUpId: "shield",
        quantity: 1,
        status: "PLACED",
        payoutQuantity: 0,
        createdAt: new Date("2026-08-05T12:00:02Z"),
        settledAt: null,
      },
    ]);

    const { powerUpWagerService } = await import("../PowerUpWagerService");
    const result = await powerUpWagerService.settleRoundWagers("round-1", ["player-b"]);

    expect(result).toEqual({
      poolSize: 3,
      winnerIds: ["player-b"],
      payouts: [
        { userId: "player-b", powerUpId: "freeze", quantity: 1 },
        { userId: "player-b", powerUpId: "shield", quantity: 2 },
      ],
    });
    expect(txMock.playerPowerUp.upsert).toHaveBeenCalledTimes(2);
    expect(txMock.playerPowerUp.upsert).toHaveBeenCalledWith({
      where: { userId_powerUpId: { userId: "player-b", powerUpId: "shield" } },
      create: {
        id: "generated-id",
        userId: "player-b",
        powerUpId: "shield",
        quantity: 2,
      },
      update: { quantity: { increment: 2 } },
    });
  });

  it("splits each power-up type deterministically between correct bettors", async () => {
    txMock.powerUpBet.findMany.mockResolvedValue([
      {
        id: "bet-a",
        roomId: "room-1",
        roundId: "round-1",
        userId: "player-a",
        powerUpId: "shield",
        quantity: 1,
        status: "PLACED",
        payoutQuantity: 0,
        createdAt: new Date("2026-08-05T12:00:00Z"),
        settledAt: null,
      },
      {
        id: "bet-b",
        roomId: "room-1",
        roundId: "round-1",
        userId: "player-b",
        powerUpId: "shield",
        quantity: 1,
        status: "PLACED",
        payoutQuantity: 0,
        createdAt: new Date("2026-08-05T12:00:01Z"),
        settledAt: null,
      },
      {
        id: "bet-c",
        roomId: "room-1",
        roundId: "round-1",
        userId: "player-c",
        powerUpId: "shield",
        quantity: 1,
        status: "PLACED",
        payoutQuantity: 0,
        createdAt: new Date("2026-08-05T12:00:02Z"),
        settledAt: null,
      },
      {
        id: "bet-d",
        roomId: "room-1",
        roundId: "round-1",
        userId: "player-d",
        powerUpId: "freeze",
        quantity: 1,
        status: "PLACED",
        payoutQuantity: 0,
        createdAt: new Date("2026-08-05T12:00:03Z"),
        settledAt: null,
      },
    ]);

    const { powerUpWagerService } = await import("../PowerUpWagerService");
    const result = await powerUpWagerService.settleRoundWagers(
      "round-1",
      ["player-b", "player-a"],
    );

    expect(result).toEqual({
      poolSize: 4,
      winnerIds: ["player-a", "player-b"],
      payouts: [
        { userId: "player-a", powerUpId: "freeze", quantity: 1 },
        { userId: "player-a", powerUpId: "shield", quantity: 2 },
        { userId: "player-b", powerUpId: "shield", quantity: 1 },
      ],
    });
  });

  it("burns the pool when no bettor answers correctly", async () => {
    txMock.powerUpBet.findMany.mockResolvedValue([
      {
        id: "bet-a",
        roomId: "room-1",
        roundId: "round-1",
        userId: "player-a",
        powerUpId: "shield",
        quantity: 1,
        status: "PLACED",
        payoutQuantity: 0,
        createdAt: new Date("2026-08-05T12:00:00Z"),
        settledAt: null,
      },
    ]);

    const { powerUpWagerService } = await import("../PowerUpWagerService");
    const result = await powerUpWagerService.settleRoundWagers("round-1", ["other-player"]);

    expect(result).toEqual({ poolSize: 1, winnerIds: [], payouts: [] });
    expect(txMock.playerPowerUp.upsert).not.toHaveBeenCalled();
    expect(txMock.powerUpBet.updateMany).toHaveBeenCalledWith({
      where: { roundId: "round-1", status: "PLACED" },
      data: { status: "LOST", settledAt: expect.any(Date) },
    });
  });
});
