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
  room: {
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
    prismaMock.xpEvent.create.mockResolvedValue({});
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
});
