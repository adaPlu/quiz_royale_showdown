import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Redis mock (module-level so vi.mock can close over it) ────────────────
const redisMock = {
  scard: vi.fn(),
  smembers: vi.fn(),
  sadd: vi.fn(),
  setJson: vi.fn(),
  expire: vi.fn(),
};

const prismaMock = {
  room: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
};

vi.mock("../../models/prismaClient", () => ({
  prisma: prismaMock,
}));

vi.mock("../RedisService", () => ({
  redisService: redisMock,
}));

vi.mock("../../utils/ulid", () => ({
  generateId: vi.fn(() => "bot-generated-id"),
  isValidId: vi.fn(() => true),
}));

// Speed up timer: replace setTimeout with an immediate resolver
vi.mock("../AuthService", () => ({
  signTokenPair: vi.fn(() => ({ accessToken: "token" })),
}));

describe("RoomService – waitForPlayersOrFillBots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    redisMock.sadd.mockResolvedValue(1);
    redisMock.setJson.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds a bot when only 1 human player is present after 10s", async () => {
    const { RoomService } = await import("../RoomService");
    const service = new RoomService();

    // After the delay scard returns 1 (only 1 human)
    redisMock.scard.mockResolvedValue(1);
    redisMock.smembers.mockResolvedValue(["human-1", "bot:bot-generated-id"]);

    const promise = service.waitForPlayersOrFillBots("room-42", ["human-1"]);
    vi.runAllTimersAsync();
    const result = await promise;

    expect(redisMock.sadd).toHaveBeenCalledWith(
      "room:room-42:players",
      "bot:bot-generated-id"
    );
    expect(result).toContain("bot:bot-generated-id");
  });

  it("does not add a bot when 2+ human players are present after 10s", async () => {
    const { RoomService } = await import("../RoomService");
    const service = new RoomService();

    // After the delay scard returns 2 (2 humans joined)
    redisMock.scard.mockResolvedValue(2);
    redisMock.smembers.mockResolvedValue(["human-1", "human-2"]);

    const promise = service.waitForPlayersOrFillBots("room-43", ["human-1", "human-2"]);
    vi.runAllTimersAsync();
    const result = await promise;

    expect(redisMock.sadd).not.toHaveBeenCalled();
    expect(result).toEqual(["human-1", "human-2"]);
  });
});
