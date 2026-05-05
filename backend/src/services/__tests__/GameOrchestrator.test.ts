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
    groupBy: vi.fn()
  },
  room: {
    update: vi.fn()
  },
  roomPlayer: {
    updateMany: vi.fn()
  },
  season: {
    findFirst: vi.fn()
  },
  seasonScore: {
    upsert: vi.fn()
  },
  powerUp: {
    findUnique: vi.fn()
  },
  playerPowerUp: {
    upsert: vi.fn()
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

vi.mock("../XpService", () => ({
  levelFromTotalXp: vi.fn((xp: number) => (xp >= 150 ? 2 : 1)),
  xpToNextLevel: vi.fn((level: number) => (level + 1) * (level + 1) * 150)
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
    prismaMock.roomPlayer.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.xpEvent.create.mockResolvedValue({});
    prismaMock.xpEvent.groupBy.mockResolvedValue([]);
    prismaMock.season.findFirst.mockResolvedValue(null);
    prismaMock.seasonScore.upsert.mockResolvedValue({});
    prismaMock.powerUp.findUnique.mockResolvedValue(null);
    prismaMock.playerPowerUp.upsert.mockResolvedValue({});
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

      // Loser gets no wins increment, gets mmr decrement
      expect(prismaMock.seasonScore.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { seasonId_userId: { seasonId: "season-1", userId: "finalist-b" } },
          update: expect.objectContaining({
            mmr: { decrement: 10 },
            gamesPlayed: { increment: 1 },
          }),
        })
      );
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
      const { levelFromTotalXp, xpToNextLevel } = await import("../XpService");
      // prevXp = 0 → level 1; newXp = 0 + 200 = 200 → level floor(sqrt(200/150)) = 1 — nope
      // We need a crossing: e.g. prevXp=140 (level 0 → level 1) or prevXp=590 → newXp=600+
      // Level 2 threshold: 2²×150 = 600. So prevXp=590, xpAwarded=40 → newXp=630 → level 2.
      vi.mocked(levelFromTotalXp).mockImplementation((xp) => {
        if (xp >= 600) return 2;
        return 1;
      });
      vi.mocked(xpToNextLevel).mockImplementation((level) => (level + 1) * (level + 1) * 150);

      // prevXp of 590 for "player-x"
      prismaMock.xpEvent.groupBy.mockResolvedValue([
        { userId: "player-x", _sum: { amount: 590 } },
      ]);
      redisMock.zrevrangeWithScores.mockResolvedValue([
        { member: "player-x", score: 400 },
      ]);

      const { GameOrchestrator } = await import("../GameOrchestrator");
      const orchestrator = new GameOrchestrator();
      const { io, playerEmitCalls } = makeIo();

      await (orchestrator as unknown as {
        runGameOver(roomId: string, io: unknown, winnerIds: string[], finalistIds: string[]): Promise<void>;
      }).runGameOver("room-lu", io, ["player-x"], ["player-x"]);

      // player-x xpAwarded = max(10, round(400/10)) = 40; prevXp=590 → newXp=630 ≥ 600 → level 2
      const calls = playerEmitCalls["player-x"] ?? [];
      const levelUpCall = calls.find(
        (args) =>
          args[0] === "message" &&
          typeof args[1] === "object" &&
          args[1] !== null &&
          (args[1] as { type: string }).type === "game:level_up"
      );
      expect(levelUpCall, "Expected game:level_up emit for player-x").toBeDefined();
      const envelope = levelUpCall![1] as { type: string; version: string; payload: { userId: string; newLevel: number; xpAwarded: number; xpToNextLevel: number } };
      expect(envelope.version).toBe("v1");
      expect(envelope.payload.userId).toBe("player-x");
      expect(envelope.payload.newLevel).toBe(2);
      expect(envelope.payload.xpAwarded).toBe(40);
    });

    it("does not emit game:level_up for players who did not level up", async () => {
      const { levelFromTotalXp, xpToNextLevel } = await import("../XpService");
      // Always return level 1 regardless of XP (no crossing)
      vi.mocked(levelFromTotalXp).mockReturnValue(1);
      vi.mocked(xpToNextLevel).mockReturnValue(600);

      prismaMock.xpEvent.groupBy.mockResolvedValue([]);
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

      // Simulate each powerUp.findUnique call returning a real record
      prismaMock.powerUp.findUnique.mockResolvedValue({ id: "powerup-record-1" });

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
