import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    room: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    roomPlayer: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUniqueOrThrow: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../models/prismaClient", () => ({
  prisma: prismaMock,
}));

vi.mock("../RedisService", () => ({
  redisService: null,
}));

vi.mock("../AuthService", () => ({
  signTokenPair: vi.fn(() => ({ accessToken: "ws-token", refreshToken: "refresh-token" })),
}));

vi.mock("../../utils/ulid", () => ({
  generateId: vi.fn(() => "generated-id"),
  isValidId: vi.fn(() => true),
}));

describe("RoomService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      id: "join-user",
      email: "join@example.com",
      displayName: "Join User",
    });
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

  it("assigns the first available seat inside the join transaction", async () => {
    const { RoomService } = await import("../RoomService");
    const service = new RoomService();

    prismaMock.room.findUnique.mockResolvedValue({
      id: "room-1",
      code: "ABC123",
      status: "WAITING",
    });
    prismaMock.roomPlayer.findUnique.mockResolvedValue(null);
    prismaMock.roomPlayer.findMany.mockResolvedValue([{ seatIndex: 0 }, { seatIndex: 2 }]);
    prismaMock.roomPlayer.create.mockResolvedValue({ id: "room-player-1" });

    const result = await service.joinRoom("join-user", "ABC123");

    expect(result.wsToken).toBe("ws-token");
    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(prismaMock.roomPlayer.create).toHaveBeenCalledWith({
      data: {
        id: "generated-id",
        roomId: "room-1",
        userId: "join-user",
        seatIndex: 1,
      },
    });
  });

  it("rejects full rooms from inside the join transaction", async () => {
    const { RoomService } = await import("../RoomService");
    const service = new RoomService();

    prismaMock.room.findUnique.mockResolvedValue({
      id: "room-1",
      code: "ABC123",
      status: "WAITING",
    });
    prismaMock.roomPlayer.findUnique.mockResolvedValue(null);
    prismaMock.roomPlayer.findMany.mockResolvedValue(
      Array.from({ length: 8 }, (_, seatIndex) => ({ seatIndex })),
    );

    await expect(service.joinRoom("join-user", "ABC123")).rejects.toThrow("Room is full");

    expect(prismaMock.roomPlayer.create).not.toHaveBeenCalled();
    expect(prismaMock.user.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("retries serialization conflicts and rechecks room capacity", async () => {
    const { RoomService } = await import("../RoomService");
    const service = new RoomService();

    prismaMock.room.findUnique.mockResolvedValue({
      id: "room-1",
      code: "ABC123",
      status: "WAITING",
    });
    prismaMock.$transaction
      .mockRejectedValueOnce({ code: "P2034" })
      .mockImplementationOnce(async (callback) => callback(prismaMock));
    prismaMock.roomPlayer.findUnique.mockResolvedValue(null);
    prismaMock.roomPlayer.findMany.mockResolvedValue(
      Array.from({ length: 8 }, (_, seatIndex) => ({ seatIndex })),
    );

    await expect(service.joinRoom("join-user", "ABC123")).rejects.toThrow("Room is full");

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    expect(prismaMock.roomPlayer.create).not.toHaveBeenCalled();
  });

  it("generates 8-character URL-safe room invite codes", async () => {
    const { RoomService } = await import("../RoomService");
    const service = new RoomService();
    const createdAt = new Date("2026-04-25T12:00:00.000Z");

    prismaMock.room.findUnique
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(async ({ where }: { where: { id?: string } }) => ({
        id: where.id,
        code: prismaMock.room.create.mock.calls[0][0].data.code,
        hostUserId: "host-user",
        status: "WAITING",
        totalRounds: 10,
        currentRound: 0,
        createdAt,
        startedAt: null,
        players: [
          {
            user: {
              id: "host-user",
              displayName: "Host",
              avatarUrl: null,
            },
            score: 0,
            streak: 0,
            isEliminated: false,
          },
        ],
      }));
    prismaMock.room.create.mockResolvedValue(undefined);
    prismaMock.roomPlayer.create.mockResolvedValue({ id: "room-player-1" });

    const result = await service.createRoom("host-user");
    const generatedCode = prismaMock.room.create.mock.calls[0][0].data.code;

    expect(generatedCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(result.room.code).toBe(generatedCode);
  });

  it("rejects starting a one-player room without the solo flag", async () => {
    const { RoomService } = await import("../RoomService");
    const service = new RoomService();

    prismaMock.room.findUnique.mockResolvedValue({
      id: "room-1",
      code: "ABCD2345",
      hostUserId: "host-user",
      status: "WAITING",
      totalRounds: 10,
      currentRound: 0,
      createdAt: new Date("2026-04-25T12:00:00.000Z"),
      startedAt: null,
      players: [
        {
          user: {
            id: "host-user",
            displayName: "Host",
            avatarUrl: null,
          },
          score: 0,
          streak: 0,
          isEliminated: false,
        },
      ],
    });

    await expect(service.startGame("room-1", "host-user")).rejects.toThrow(
      "At least 2 players are required to start",
    );
    expect(prismaMock.room.update).not.toHaveBeenCalled();
  });

  it("allows the host to start a one-player room with the solo flag", async () => {
    const { RoomService } = await import("../RoomService");
    const service = new RoomService();
    const createdAt = new Date("2026-04-25T12:00:00.000Z");
    const waitingRoom = {
      id: "room-1",
      code: "ABCD2345",
      hostUserId: "host-user",
      status: "WAITING",
      totalRounds: 10,
      currentRound: 0,
      createdAt,
      startedAt: null,
      players: [
        {
          user: {
            id: "host-user",
            displayName: "Host",
            avatarUrl: null,
          },
          score: 0,
          streak: 0,
          isEliminated: false,
        },
      ],
    };
    const startedRoom = {
      ...waitingRoom,
      status: "COUNTDOWN",
      startedAt: new Date("2026-04-25T12:00:01.000Z"),
    };

    prismaMock.room.findUnique.mockResolvedValueOnce(waitingRoom).mockResolvedValueOnce(startedRoom);
    prismaMock.room.update.mockResolvedValue(undefined);

    const result = await service.startGame("room-1", "host-user", { allowSolo: true });

    expect(prismaMock.room.update).toHaveBeenCalledWith({
      where: { id: "room-1" },
      data: {
        status: "COUNTDOWN",
        startedAt: expect.any(Date),
      },
    });
    expect(result.room.phase).toBe("COUNTDOWN");
    expect(result.room.players).toHaveLength(1);
  });
});
