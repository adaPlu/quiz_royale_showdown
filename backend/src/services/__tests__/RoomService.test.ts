import { beforeEach, describe, expect, it, vi } from "vitest";

const txMock = {
  room: {
    findUnique: vi.fn(),
  },
  roomPlayer: {
    create: vi.fn(),
  },
};

const prismaMock = {
  room: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  roomPlayer: {
    create: vi.fn(),
  },
  user: {
    findUniqueOrThrow: vi.fn(),
  },
  $transaction: vi.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
};

vi.mock("../../models/prismaClient", () => ({
  prisma: prismaMock
}));

vi.mock("../RedisService", () => ({
  redisService: null
}));

vi.mock("../AuthService", () => ({
  signTokenPair: vi.fn(() => ({ accessToken: "mock-ws-token", refreshToken: "mock-refresh" })),
}));

describe("RoomService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resets stale COUNTDOWN rooms without live orchestrator or Redis state", async () => {
    const { RoomService } = await import("../RoomService");
    const service = new RoomService();

    prismaMock.room.findUnique.mockResolvedValue({
      id: "room-1",
      status: "COUNTDOWN"
    });
    prismaMock.room.updateMany.mockResolvedValue({ count: 1 });

    const recovered = await service.recoverStaleCountdown("room-1", false);

    expect(recovered).toBe(true);
    expect(prismaMock.room.updateMany).toHaveBeenCalledWith({
      where: { id: "room-1", status: "COUNTDOWN" },
      data: {
        status: "WAITING",
        startedAt: null
      }
    });
  });

  it("does not reset COUNTDOWN rooms while an orchestrator is active", async () => {
    const { RoomService } = await import("../RoomService");
    const service = new RoomService();

    prismaMock.room.findUnique.mockResolvedValue({
      id: "room-1",
      status: "COUNTDOWN"
    });

    const recovered = await service.recoverStaleCountdown("room-1", true);

    expect(recovered).toBe(false);
    expect(prismaMock.room.updateMany).not.toHaveBeenCalled();
  });
});

describe("joinRoom transaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: transaction executor runs the callback with txMock
    prismaMock.$transaction.mockImplementation(
      async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)
    );
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      id: "user-joining",
      email: "joiner@example.com",
      displayName: "Joiner",
    });
  });

  it("throws ConflictError when the room is full", async () => {
    const { RoomService } = await import("../RoomService");
    const service = new RoomService();

    // Outer findUnique (by code) returns a WAITING room
    prismaMock.room.findUnique.mockResolvedValue({
      id: "room-full",
      code: "ABCDEF",
      status: "WAITING",
    });

    // Inner tx.room.findUnique returns the same room but with maxPlayers (8) players already seated
    txMock.room.findUnique.mockResolvedValue({
      id: "room-full",
      code: "ABCDEF",
      status: "WAITING",
      players: Array.from({ length: 8 }, (_, i) => ({ userId: `player-${i}` })),
    });

    await expect(service.joinRoom("user-joining", "ABCDEF")).rejects.toThrow("Room is full");
    expect(txMock.roomPlayer.create).not.toHaveBeenCalled();
  });

  it("does not create a duplicate RoomPlayer when user is already in the room", async () => {
    const { RoomService } = await import("../RoomService");
    const service = new RoomService();

    prismaMock.room.findUnique.mockResolvedValue({
      id: "room-joined",
      code: "BCDEFG",
      status: "WAITING",
    });

    // tx.room.findUnique shows user-joining is already a player
    txMock.room.findUnique.mockResolvedValue({
      id: "room-joined",
      code: "BCDEFG",
      status: "WAITING",
      players: [{ userId: "user-joining" }],
    });

    await service.joinRoom("user-joining", "BCDEFG");

    // roomPlayer.create must NOT have been called inside the transaction
    expect(txMock.roomPlayer.create).not.toHaveBeenCalled();
  });

  it("creates a RoomPlayer when the room has space and the user is not already in it", async () => {
    const { RoomService } = await import("../RoomService");
    const service = new RoomService();

    prismaMock.room.findUnique.mockResolvedValue({
      id: "room-open",
      code: "CDEFGH",
      status: "WAITING",
    });

    txMock.room.findUnique.mockResolvedValue({
      id: "room-open",
      code: "CDEFGH",
      status: "WAITING",
      players: [{ userId: "existing-player" }],
    });
    txMock.roomPlayer.create.mockResolvedValue({});

    await service.joinRoom("user-joining", "CDEFGH");

    expect(txMock.roomPlayer.create).toHaveBeenCalledOnce();
    expect(txMock.roomPlayer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ roomId: "room-open", userId: "user-joining" }),
      })
    );
  });
});
