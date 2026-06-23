import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    room: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    roomPlayer: {
      count: vi.fn(),
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
});
