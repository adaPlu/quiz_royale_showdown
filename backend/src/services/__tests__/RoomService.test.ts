import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  room: {
    findUnique: vi.fn(),
    updateMany: vi.fn()
  }
};

vi.mock("../../models/prismaClient", () => ({
  prisma: prismaMock
}));

vi.mock("../RedisService", () => ({
  redisService: null
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
