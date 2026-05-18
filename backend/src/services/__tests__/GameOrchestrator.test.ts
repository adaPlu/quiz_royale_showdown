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
    create: vi.fn(),
    groupBy: vi.fn(),
    aggregate: vi.fn(),
  },
  room: {
    update: vi.fn(),
    updateMany: vi.fn()
  },
  roomPlayer: {
    updateMany: vi.fn()
  },
  round: {
    findMany: vi.fn(),
  },
  answer: {
    groupBy: vi.fn(),
    findMany: vi.fn(),
  },
  powerUpUse: {
    groupBy: vi.fn(),
  },
  season: {
    findFirst: vi.fn()
  },
  seasonScore: {
    upsert: vi.fn()
  },
  powerUp: {
    findUnique: vi.fn(),
    findMany: vi.fn()
  },
  playerPowerUp: {
    upsert: vi.fn()
  },
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
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

vi.mock("../XpService", () => ({
  levelFromTotalXp: vi.fn((xp: number) => (xp >= 150 ? 2 : 1)),
  xpToNextLevel: vi.fn((level: number) => (level + 1) * (level + 1) * 150),
  awardMatchXp: vi.fn(async (_roomId: string, players: Array<{ playerId: string; rank: number; score: number }>) => {
    const results: Array<{
      playerId: string;
      xpAwarded: number;
      totalXp: number;
      newLevel: number;
      prevLevel: number;
      didLevelUp: boolean;
      xpToNextLevel: number;
    }> = [];
    for (const p of players) {
      const xpAwarded = Math.max(10, Math.round(p.score / 10));
      await prismaMock.xpEvent.create({
        data: {
          id: "generated-id",
          userId: p.playerId,
          reason: "GAME_FINISH",
          amount: xpAwarded,
          metadata: { roomId: _roomId, rank: p.rank },
        },
      });
      results.push({ playerId: p.playerId, xpAwarded, totalXp: xpAwarded, newLevel: 1, prevLevel: 1, didLevelUp: false, xpToNextLevel: 600 });
    }
    return results;
  }),
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

const CANONICAL_POWERUP_CODES = [
  "DOUBLE_DOWN",
  "FIFTY_FIFTY",
  "TIME_FREEZE",
  "SHIELD",
  "SABOTAGE",
] as const;
type CanonicalPowerupCode = (typeof CANONICAL_POWERUP_CODES)[number];

describe("GameOrchestrator hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.del.mockResolvedValue(1);
    prismaMock.room.update.mockResolvedValue({});
    prismaMock.room.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.roomPlayer.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.xpEvent.create.mockResolvedValue({});
    prismaMock.xpEvent.groupBy.mockResolvedValue([]);
    prismaMock.xpEvent.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    prismaMock.season.findFirst.mockResolvedValue(null);
    prismaMock.seasonScore.upsert.mockResolvedValue({});
    prismaMock.powerUp.findUnique.mockResolvedValue(null);
    prismaMock.powerUp.findMany.mockResolvedValue([]);
    prismaMock.playerPowerUp.upsert.mockResolvedValue({});
    prismaMock.round.findMany.mockResolvedValue([]);
    prismaMock.answer.groupBy.mockResolvedValue([]);
    prismaMock.answer.findMany.mockResolvedValue([]);
    prismaMock.powerUpUse.groupBy.mockResolvedValue([]);
    prismaMock.$executeRaw.mockResolvedValue(0);
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock));
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
    expect(prismaMock.room.updateMany).toHaveBeenCalledWith({
      where: { id: "room-1", status: { not: "GAME_OVER" } },
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

  it("emits powerup:loot_drop to each finalist's private room after game:over", async () => {
    const { GameOrchestrator } = await import("../GameOrchestrator");
    const orchestrator = new GameOrchestrator();

    // Two finalists with known scores
    const finalistIds = ["player-alpha", "player-beta"];
    redisMock.zrevrangeWithScores.mockResolvedValue([
      { member: "player-alpha", score: 500 },
      { member: "player-beta", score: 300 },
    ]);

    // Collect per-player emit calls keyed by the room passed to io.to()
    const playerEmitCalls: Record<string, Array<unknown[]>> = {};
    const ioMock = {
      to: vi.fn((room: string) => ({
        emit: vi.fn((event: string, ...args: unknown[]) => {
          // This path is used by emitRoomEnvelope (room-level broadcast)
          void room;
          void event;
          void args;
        }),
      })),
      // Direct io.to(playerId).emit() calls (loot drop)
      emit: vi.fn(),
    };

    // Override: track calls to io.to(playerId).emit() separately
    ioMock.to.mockImplementation((room: string) => {
      if (!playerEmitCalls[room]) playerEmitCalls[room] = [];
      return {
        emit: vi.fn((...args: unknown[]) => {
          playerEmitCalls[room].push(args);
        }),
      };
    });

    await (orchestrator as unknown as {
      runGameOver(
        roomId: string,
        io: unknown,
        winnerIds: string[],
        finalistIds: string[]
      ): Promise<void>;
    }).runGameOver("room-2", ioMock, ["player-alpha"], finalistIds);

    // Each finalist should have received exactly one loot_drop message on their
    // private socket room (io.to(playerId).emit)
    for (const playerId of finalistIds) {
      const calls = playerEmitCalls[playerId];
      expect(calls, `Expected loot_drop emit for ${playerId}`).toBeDefined();

      const lootCall = calls?.find(
        (args) =>
          args[0] === "message" &&
          typeof args[1] === "object" &&
          args[1] !== null &&
          (args[1] as { type: string }).type === "powerup:loot_drop"
      );
      expect(lootCall, `Expected powerup:loot_drop message for ${playerId}`).toBeDefined();

      const envelope = lootCall![1] as {
        type: string;
        version: string;
        payload: { powerupType: string; quantity: number };
      };
      expect(envelope.version).toBe("v1");
      expect(envelope.payload.quantity).toBe(1);
      expect(CANONICAL_POWERUP_CODES).toContain(
        envelope.payload.powerupType as CanonicalPowerupCode
      );
    }
  });

  it("loot drop: each finalist receives a powerupType from the canonical enum", async () => {
    const { GameOrchestrator } = await import("../GameOrchestrator");
    const orchestrator = new GameOrchestrator();

    const finalistIds = ["player-1", "player-2", "player-3"];
    redisMock.zrevrangeWithScores.mockResolvedValue(
      finalistIds.map((id, i) => ({ member: id, score: (3 - i) * 100 }))
    );

    const droppedPowerups: string[] = [];
    const ioMock = {
      to: vi.fn().mockImplementation(() => ({
        emit: vi.fn((event: string, payload: unknown) => {
          if (
            event === "message" &&
            typeof payload === "object" &&
            payload !== null &&
            (payload as { type: string }).type === "powerup:loot_drop"
          ) {
            droppedPowerups.push(
              (payload as { payload: { powerupType: string } }).payload.powerupType
            );
          }
        }),
      })),
    };

    await (orchestrator as unknown as {
      runGameOver(
        roomId: string,
        io: unknown,
        winnerIds: string[],
        finalistIds: string[]
      ): Promise<void>;
    }).runGameOver("room-3", ioMock, ["player-1"], finalistIds);

    // We should receive one loot_drop per finalist
    expect(droppedPowerups).toHaveLength(finalistIds.length);

    // Every powerupType must be in the canonical enum
    for (const code of droppedPowerups) {
      expect(CANONICAL_POWERUP_CODES).toContain(code as CanonicalPowerupCode);
    }
  });

  describe("SeasonScore upsert", () => {
    const activeSeason = { id: "season-1", slug: "s1", name: "Season 1", startsAt: new Date(), endsAt: new Date() };

    function makeIo() {
      const emit = vi.fn();
      return { to: vi.fn(() => ({ emit })), emit };
    }

    it("upserts SeasonScore for each finalist when an active season exists", async () => {
      const { GameOrchestrator } = await import("../GameOrchestrator");
      const orchestrator = new GameOrchestrator();
      const io = makeIo();

      prismaMock.season.findFirst.mockResolvedValue(activeSeason);
      redisMock.zrevrangeWithScores.mockResolvedValue([
        { member: "finalist-a", score: 500 },
        { member: "finalist-b", score: 300 },
      ]);

      await (orchestrator as unknown as {
        runGameOver(roomId: string, io: unknown, winnerIds: string[], finalistIds: string[]): Promise<void>;
      }).runGameOver("room-10", io, ["finalist-a"], ["finalist-a", "finalist-b"]);

      expect(prismaMock.seasonScore.upsert).toHaveBeenCalledTimes(2);

      // Winner gets wins increment
      expect(prismaMock.seasonScore.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { seasonId_userId: { seasonId: "season-1", userId: "finalist-a" } },
          update: expect.objectContaining({
            mmr: { increment: 25 },
            wins: { increment: 1 },
            gamesPlayed: { increment: 1 },
          }),
        })
      );

      // Loser gets no wins increment; MMR floor handled via $executeRaw
      expect(prismaMock.seasonScore.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { seasonId_userId: { seasonId: "season-1", userId: "finalist-b" } },
          update: expect.objectContaining({
            gamesPlayed: { increment: 1 },
          }),
        })
      );
      expect(prismaMock.$executeRaw).toHaveBeenCalled();
    });

    it("skips SeasonScore upsert when no active season exists", async () => {
      const { GameOrchestrator } = await import("../GameOrchestrator");
      const orchestrator = new GameOrchestrator();
      const io = makeIo();

      prismaMock.season.findFirst.mockResolvedValue(null);
      redisMock.zrevrangeWithScores.mockResolvedValue([
        { member: "finalist-a", score: 200 },
      ]);

      await (orchestrator as unknown as {
        runGameOver(roomId: string, io: unknown, winnerIds: string[], finalistIds: string[]): Promise<void>;
      }).runGameOver("room-11", io, ["finalist-a"], ["finalist-a"]);

      expect(prismaMock.seasonScore.upsert).not.toHaveBeenCalled();
    });
  });

  describe("game:level_up emission", () => {
    function makeIo() {
      const playerEmitCalls: Record<string, Array<unknown[]>> = {};
      const io = {
        to: vi.fn((room: string) => {
          if (!playerEmitCalls[room]) playerEmitCalls[room] = [];
          return {
            emit: vi.fn((...args: unknown[]) => {
              playerEmitCalls[room].push(args);
            }),
          };
        }),
      };
      return { io, playerEmitCalls };
    }

    it("emits game:level_up to a player who crosses a level threshold", async () => {
      const { awardMatchXp } = await import("../XpService");
      vi.mocked(awardMatchXp).mockResolvedValueOnce([{
        playerId: "player-x",
        xpAwarded: 40,
        totalXp: 630,
        newLevel: 2,
        prevLevel: 1,
        didLevelUp: true,
        xpToNextLevel: 1350,
      }]);

      redisMock.zrevrangeWithScores.mockResolvedValue([
        { member: "player-x", score: 400 },
      ]);

      const { GameOrchestrator } = await import("../GameOrchestrator");
      const orchestrator = new GameOrchestrator();
      const { io, playerEmitCalls } = makeIo();

      await (orchestrator as unknown as {
        runGameOver(roomId: string, io: unknown, winnerIds: string[], finalistIds: string[]): Promise<void>;
      }).runGameOver("room-lu", io, ["player-x"], ["player-x"]);

      const calls = playerEmitCalls["player-x"] ?? [];
      const levelUpCall = calls.find(
        (args) =>
          args[0] === "message" &&
          typeof args[1] === "object" &&
          args[1] !== null &&
          (args[1] as { type: string }).type === "game:level_up"
      );
      expect(levelUpCall, "Expected game:level_up emit for player-x").toBeDefined();
      const envelope = levelUpCall![1] as { version: string; payload: { userId: string; newLevel: number; xpAwarded: number } };
      expect(envelope.version).toBe("v1");
      expect(envelope.payload.userId).toBe("player-x");
      expect(envelope.payload.newLevel).toBe(2);
      expect(envelope.payload.xpAwarded).toBe(40);
    });

    it("does not emit game:level_up for players who did not level up", async () => {
      redisMock.zrevrangeWithScores.mockResolvedValue([
        { member: "player-y", score: 100 },
      ]);

      const { GameOrchestrator } = await import("../GameOrchestrator");
      const orchestrator = new GameOrchestrator();
      const { io, playerEmitCalls } = makeIo();

      await (orchestrator as unknown as {
        runGameOver(roomId: string, io: unknown, winnerIds: string[], finalistIds: string[]): Promise<void>;
      }).runGameOver("room-nolu", io, ["player-y"], ["player-y"]);

      const calls = playerEmitCalls["player-y"] ?? [];
      const levelUpCall = calls.find(
        (args) =>
          args[0] === "message" &&
          typeof args[1] === "object" &&
          args[1] !== null &&
          (args[1] as { type: string }).type === "game:level_up"
      );
      expect(levelUpCall).toBeUndefined();
    });
  });

  describe("loot drop", () => {
    function makeIo(droppedPowerups?: string[]) {
      return {
        to: vi.fn().mockImplementation(() => ({
          emit: vi.fn((event: string, payload: unknown) => {
            if (
              droppedPowerups &&
              event === "message" &&
              typeof payload === "object" &&
              payload !== null &&
              (payload as { type: string }).type === "powerup:loot_drop"
            ) {
              droppedPowerups.push(
                (payload as { payload: { powerupType: string } }).payload.powerupType
              );
            }
          }),
        })),
      };
    }

    it("emits powerup:loot_drop to each finalist's socket room after runGameOver", async () => {
      const droppedPowerups: string[] = [];
      const io = makeIo(droppedPowerups);
      const finalistIds = ["finalist-x", "finalist-y"];

      redisMock.zrevrangeWithScores.mockResolvedValue([
        { member: "finalist-x", score: 300 },
        { member: "finalist-y", score: 200 },
      ]);

      const { GameOrchestrator } = await import("../GameOrchestrator");
      const orchestrator = new GameOrchestrator();

      await (orchestrator as unknown as {
        runGameOver(roomId: string, io: unknown, winnerIds: string[], finalistIds: string[]): Promise<void>;
      }).runGameOver("room-ld1", io, ["finalist-x"], finalistIds);

      // One loot_drop emission per finalist
      expect(droppedPowerups).toHaveLength(finalistIds.length);
    });

    it("calls prisma.playerPowerUp.upsert once per finalist when powerUp record exists", async () => {
      const finalistIds = ["finalist-p", "finalist-q"];

      redisMock.zrevrangeWithScores.mockResolvedValue([
        { member: "finalist-p", score: 400 },
        { member: "finalist-q", score: 250 },
      ]);

      prismaMock.powerUp.findMany.mockResolvedValue([
        { id: "powerup-record-1", code: "DOUBLE_DOWN" },
        { id: "powerup-record-2", code: "FIFTY_FIFTY" },
        { id: "powerup-record-3", code: "TIME_FREEZE" },
        { id: "powerup-record-4", code: "SHIELD" },
        { id: "powerup-record-5", code: "SABOTAGE" },
      ]);

      const io = makeIo();
      const { GameOrchestrator } = await import("../GameOrchestrator");
      const orchestrator = new GameOrchestrator();

      await (orchestrator as unknown as {
        runGameOver(roomId: string, io: unknown, winnerIds: string[], finalistIds: string[]): Promise<void>;
      }).runGameOver("room-ld2", io, ["finalist-p"], finalistIds);

      expect(prismaMock.playerPowerUp.upsert).toHaveBeenCalledTimes(finalistIds.length);
    });
  });
});
