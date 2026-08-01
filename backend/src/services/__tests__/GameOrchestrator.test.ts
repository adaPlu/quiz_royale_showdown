import { beforeEach, describe, expect, it, vi } from "vitest";

const redisMock = {
  zrevrangeWithScores: vi.fn(),
  del: vi.fn()
};

const prismaMock = {
  questionBank: {
    count: vi.fn()
  },
  xpEvent: {
    create: vi.fn()
  },
  seasonScore: {
    upsert: vi.fn()
  },
  room: {
    findUnique: vi.fn(),
    update: vi.fn()
  }
};

vi.mock("../../models/prismaClient", () => ({
  prisma: prismaMock
}));

vi.mock("../RedisService", () => ({
  redisService: redisMock
}));

vi.mock("../RoomService", () => ({
  roomService: {
    resetStartFailure: vi.fn()
  }
}));

vi.mock("../../utils/ulid", () => ({
  generateId: vi.fn(() => "generated-id")
}));

function createIoMock() {
  const emit = vi.fn();

  return {
    emit,
    io: {
      to: vi.fn(() => ({ emit }))
    }
  };
}

describe("GameOrchestrator hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.del.mockResolvedValue(1);
    prismaMock.room.findUnique.mockResolvedValue({ seasonId: null });
    prismaMock.room.update.mockResolvedValue({});
    prismaMock.xpEvent.create.mockResolvedValue({});
    prismaMock.seasonScore.upsert.mockResolvedValue({});
  });

  it("computes winners from finalists only, excluding eliminated high scorers", async () => {
    const { GameOrchestrator } = await import("../GameOrchestrator");
    const orchestrator = new GameOrchestrator();

    redisMock.zrevrangeWithScores.mockResolvedValue([
      { member: "eliminated", score: 9000 },
      { member: "finalist-b", score: 400 },
      { member: "finalist-a", score: 300 }
    ]);

    const winners = await (orchestrator as unknown as {
      computeWinners(roomId: string, finalistIds: string[]): Promise<string[]>;
    }).computeWinners("room-1", ["finalist-a", "finalist-b"]);

    expect(winners).toEqual(["finalist-b"]);
  });

  it("emits game over, writes XP, and cleans Redis for finalists only", async () => {
    const { GameOrchestrator } = await import("../GameOrchestrator");
    const orchestrator = new GameOrchestrator();
    const { io, emit } = createIoMock();

    redisMock.zrevrangeWithScores.mockResolvedValue([
      { member: "eliminated", score: 9000 },
      { member: "finalist-b", score: 400 },
      { member: "finalist-a", score: 300 }
    ]);

    await (orchestrator as unknown as {
      runGameOver(
        roomId: string,
        io: unknown,
        winnerIds: string[],
        finalistIds: string[]
      ): Promise<void>;
    }).runGameOver("room-1", io, ["finalist-b"], ["finalist-a", "finalist-b"]);

    expect(prismaMock.xpEvent.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.seasonScore.upsert).not.toHaveBeenCalled();
    expect(prismaMock.xpEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "finalist-b",
        reason: "GAME_FINISH",
        amount: 40,
        metadata: { roomId: "room-1", rank: 1 }
      })
    });
    expect(prismaMock.xpEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "finalist-a",
        reason: "GAME_FINISH",
        amount: 30,
        metadata: { roomId: "room-1", rank: 2 }
      })
    });
    expect(prismaMock.room.update).toHaveBeenCalledWith({
      where: { id: "room-1" },
      data: { status: "GAME_OVER", finishedAt: expect.any(Date) }
    });
    expect(emit).toHaveBeenCalledWith("message", {
      type: "game:over",
      version: "v1",
      payload: {
        roomId: "room-1",
        winnerId: "finalist-b",
        finalStandings: [
          { playerId: "finalist-b", rank: 1, score: 400, xpAwarded: 40 },
          { playerId: "finalist-a", rank: 2, score: 300, xpAwarded: 30 }
        ]
      }
    });
    expect(redisMock.del).toHaveBeenCalledWith(
      "game:room-1:state",
      "game:room-1:current_question",
      "room:room-1:players",
      "room:room-1:scores"
    );
  });

  it("upserts season scores for season games at game over", async () => {
    const { GameOrchestrator } = await import("../GameOrchestrator");
    const orchestrator = new GameOrchestrator();
    const { io } = createIoMock();

    prismaMock.room.findUnique.mockResolvedValue({ seasonId: "season-1" });
    redisMock.zrevrangeWithScores.mockResolvedValue([
      { member: "finalist-b", score: 400 },
      { member: "finalist-a", score: 300 }
    ]);

    await (orchestrator as unknown as {
      runGameOver(
        roomId: string,
        io: unknown,
        winnerIds: string[],
        finalistIds: string[]
      ): Promise<void>;
    }).runGameOver("room-1", io, ["finalist-b"], ["finalist-a", "finalist-b"]);

    expect(prismaMock.seasonScore.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.seasonScore.upsert).toHaveBeenCalledWith({
      where: {
        seasonId_userId: {
          seasonId: "season-1",
          userId: "finalist-b"
        }
      },
      create: {
        id: "generated-id",
        seasonId: "season-1",
        userId: "finalist-b",
        mmr: 1025,
        wins: 1,
        gamesPlayed: 1
      },
      update: {
        mmr: { increment: 25 },
        wins: { increment: 1 },
        gamesPlayed: { increment: 1 }
      }
    });
    expect(prismaMock.seasonScore.upsert).toHaveBeenCalledWith({
      where: {
        seasonId_userId: {
          seasonId: "season-1",
          userId: "finalist-a"
        }
      },
      create: {
        id: "generated-id",
        seasonId: "season-1",
        userId: "finalist-a",
        mmr: 1000,
        wins: 0,
        gamesPlayed: 1
      },
      update: {
        mmr: { increment: 0 },
        wins: { increment: 0 },
        gamesPlayed: { increment: 1 }
      }
    });
  });
});
