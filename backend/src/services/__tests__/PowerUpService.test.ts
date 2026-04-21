import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, redisServiceMock } = vi.hoisted(() => {
  const prismaMock = {
    powerUp: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    playerPowerUp: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      createMany: vi.fn(),
    },
    powerUpUse: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  const redisServiceMock = {
    setnx: vi.fn(),
    del: vi.fn(),
    set: vi.fn(),
    get: vi.fn(),
    publish: vi.fn(),
    sadd: vi.fn(),
    srem: vi.fn(),
    smembers: vi.fn(),
    expire: vi.fn(),
  };

  return { prismaMock, redisServiceMock };
});

vi.mock("../../models/prismaClient", () => ({ prisma: prismaMock }));
vi.mock("../RedisService", () => ({ redisService: redisServiceMock }));
vi.mock("../../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock("../../utils/ulid", () => ({ generateId: vi.fn(() => "generated-id") }));

import {
  CANONICAL_PHASE_2_POWERUP_CODES,
  comparePowerUpCodes,
  normalizePowerUpCode,
  PowerUpService,
  type PowerUpCode,
  selectWrongAnswerIndices,
  toPowerUpInventoryItem,
} from "../PowerUpService";

const ROOM_ID = "room-1";
const USER_ID = "user-1";
const ROUND_ID = "round-1";
const POWERUP_STATE_TTL_SECONDS = 2 * 60 * 60;

function powerUpIdFor(code: PowerUpCode): string {
  return `${code.toLowerCase()}-id`;
}

function primeActivation(code: PowerUpCode): void {
  prismaMock.powerUp.findFirst.mockResolvedValue({ id: powerUpIdFor(code), code });
  prismaMock.playerPowerUp.findUnique.mockResolvedValue({ quantity: 1 });
  prismaMock.playerPowerUp.update.mockReturnValue({ operation: "update" });
  prismaMock.powerUpUse.create.mockReturnValue({ operation: "create" });
  prismaMock.$transaction.mockResolvedValue([{ quantity: 0 }, { id: "usage-id" }]);

  redisServiceMock.setnx.mockResolvedValue(true);
  redisServiceMock.del.mockResolvedValue(1);
  redisServiceMock.set.mockResolvedValue(undefined);
  redisServiceMock.get.mockResolvedValue(null);
  redisServiceMock.publish.mockResolvedValue(1);
  redisServiceMock.sadd.mockResolvedValue(1);
  redisServiceMock.srem.mockResolvedValue(1);
  redisServiceMock.smembers.mockResolvedValue([]);
  redisServiceMock.expire.mockResolvedValue(true);
}

function activationInput(code: PowerUpCode) {
  return {
    roomId: ROOM_ID,
    userId: USER_ID,
    powerUpId: code,
    roundId: ROUND_ID,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PowerUpService helpers", () => {
  it("normalizes supported power-up codes", () => {
    expect(normalizePowerUpCode("fifty_fifty")).toBe("FIFTY_FIFTY");
    expect(normalizePowerUpCode("TIME_FREEZE")).toBe("TIME_FREEZE");
  });

  it("rejects legacy non-canonical power-up codes", () => {
    expect(() => normalizePowerUpCode("TIME_BOOST")).toThrow("Unsupported power-up code");
    expect(CANONICAL_PHASE_2_POWERUP_CODES).toEqual([
      "DOUBLE_DOWN",
      "FIFTY_FIFTY",
      "TIME_FREEZE",
      "SHIELD",
      "SABOTAGE",
    ]);
  });

  it("builds stable client inventory DTOs", () => {
    const items = [
      {
        id: "sabotage-id",
        code: "SABOTAGE",
        name: "Sabotage",
        description: "Force a target player to skip this question.",
        rarity: "EPIC",
      },
      {
        id: "double-down-id",
        code: "DOUBLE_DOWN",
        name: "Double Down",
        description: "Double your score for this round if correct.",
        rarity: "COMMON",
      },
    ];

    const dto = items
      .sort((left, right) => comparePowerUpCodes(left.code, right.code))
      .map((powerUp) => toPowerUpInventoryItem(powerUp, powerUp.code === "DOUBLE_DOWN" ? 1 : 0));

    expect(dto).toEqual([
      {
        powerUpId: "double-down-id",
        code: "DOUBLE_DOWN",
        quantity: 1,
        name: "Double Down",
        description: "Double your score for this round if correct.",
        rarity: "COMMON",
      },
      {
        powerUpId: "sabotage-id",
        code: "SABOTAGE",
        quantity: 0,
        name: "Sabotage",
        description: "Force a target player to skip this question.",
        rarity: "EPIC",
      },
    ]);
  });

  it("selects wrong answer indices without returning the correct index", () => {
    const selected = selectWrongAnswerIndices(2, 2, () => 0);

    expect(selected).toHaveLength(2);
    expect(selected).not.toContain(2);
    expect(new Set(selected).size).toBe(2);
  });
});

describe("PowerUpService canonical activation effects", () => {
  it("stores DOUBLE_DOWN as an authoritative score multiplier", async () => {
    primeActivation("DOUBLE_DOWN");

    const result = await new PowerUpService().activatePowerUp(activationInput("DOUBLE_DOWN"));

    expect(redisServiceMock.set).toHaveBeenCalledWith(
      `powerup:${ROOM_ID}:${USER_ID}:double_down`,
      "2",
      POWERUP_STATE_TTL_SECONDS,
    );
    expect(result).toEqual({
      roomId: ROOM_ID,
      userId: USER_ID,
      powerUpId: powerUpIdFor("DOUBLE_DOWN"),
      code: "DOUBLE_DOWN",
      publicEffect: { type: "DOUBLE_DOWN", targetPlayerId: USER_ID },
    });
  });

  it("returns FIFTY_FIFTY masked answer indices only as a private effect", async () => {
    primeActivation("FIFTY_FIFTY");
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    const result = await new PowerUpService().activatePowerUp({
      ...activationInput("FIFTY_FIFTY"),
      correctAnswerIndex: 1,
      questionOptions: ["A", "B", "C", "D"],
    });

    randomSpy.mockRestore();

    expect(result.publicEffect).toEqual({ type: "FIFTY_FIFTY", targetPlayerId: USER_ID });
    expect(result.privateEffect).toEqual({
      type: "FIFTY_FIFTY",
      maskedAnswerIndices: [2, 3],
    });
    expect(result.privateEffect?.maskedAnswerIndices).not.toContain(1);
  });

  it("stores and publishes TIME_FREEZE extra time", async () => {
    primeActivation("TIME_FREEZE");

    const result = await new PowerUpService().activatePowerUp(activationInput("TIME_FREEZE"));

    expect(redisServiceMock.set).toHaveBeenCalledWith(
      `powerup:${ROOM_ID}:${USER_ID}:time_boost`,
      "5000",
      POWERUP_STATE_TTL_SECONDS,
    );
    expect(redisServiceMock.publish).toHaveBeenCalledWith(
      `game:${ROOM_ID}:events`,
      JSON.stringify({ type: "TIME_FREEZE", userId: USER_ID, extraMs: 5_000 }),
    );
    expect(result.publicEffect).toEqual({
      type: "TIME_FREEZE",
      targetPlayerId: USER_ID,
      extraMs: 5_000,
    });
  });

  it("records SHIELD for the activating player", async () => {
    primeActivation("SHIELD");

    const result = await new PowerUpService().activatePowerUp(activationInput("SHIELD"));

    expect(redisServiceMock.sadd).toHaveBeenCalledWith(`powerup:${ROOM_ID}:shielded`, USER_ID);
    expect(redisServiceMock.expire).toHaveBeenCalledWith(
      `powerup:${ROOM_ID}:shielded`,
      POWERUP_STATE_TTL_SECONDS,
    );
    expect(result.publicEffect).toEqual({ type: "SHIELD", targetPlayerId: USER_ID });
  });

  it("requires SABOTAGE to include a target before consuming inventory", async () => {
    primeActivation("SABOTAGE");

    await expect(new PowerUpService().activatePowerUp(activationInput("SABOTAGE"))).rejects.toThrow(
      "SABOTAGE requires targetPlayerId",
    );

    expect(redisServiceMock.setnx).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("stores SABOTAGE against the targeted player", async () => {
    primeActivation("SABOTAGE");

    const result = await new PowerUpService().activatePowerUp({
      ...activationInput("SABOTAGE"),
      targetPlayerId: "target-player",
    });

    expect(redisServiceMock.set).toHaveBeenCalledWith(
      `powerup:${ROOM_ID}:target-player:sabotaged`,
      "1",
      POWERUP_STATE_TTL_SECONDS,
    );
    expect(result.publicEffect).toEqual({ type: "SABOTAGE", targetPlayerId: "target-player" });
  });
});
