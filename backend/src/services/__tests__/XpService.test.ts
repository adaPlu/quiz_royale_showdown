import { beforeEach, describe, expect, it, vi } from "vitest";

// Prisma mock required because XpService imports prismaClient at module level
const prismaMock = {
  xpEvent: {
    groupBy: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
  },
};

vi.mock("../../models/prismaClient", () => ({
  prisma: prismaMock,
}));

vi.mock("../../utils/ulid", () => ({
  generateId: vi.fn(() => "generated-xp-id"),
}));

describe("levelFromTotalXp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns level 1 for 0 XP", async () => {
    const { levelFromTotalXp } = await import("../XpService");
    expect(levelFromTotalXp(0)).toBe(1);
  });

  it("returns level 1 for 149 XP (below the first meaningful threshold)", async () => {
    const { levelFromTotalXp } = await import("../XpService");
    // floor(sqrt(149/150)) = floor(0.9966) = 0 → max(1, 0) = 1
    expect(levelFromTotalXp(149)).toBe(1);
  });

  it("returns level 1 for 150 XP — formula gives floor(sqrt(1))=1, not 2", async () => {
    const { levelFromTotalXp } = await import("../XpService");
    // floor(sqrt(150/150)) = floor(sqrt(1)) = floor(1) = 1 → level 1
    // Note: level 2 requires 600 XP (2² × 150), not 150 XP
    expect(levelFromTotalXp(150)).toBe(1);
  });

  it("returns level 1 for XP below the first non-trivial threshold (599)", async () => {
    const { levelFromTotalXp } = await import("../XpService");
    // floor(sqrt(599/150)) = floor(sqrt(3.993)) = floor(1.998) = 1 → level 1
    expect(levelFromTotalXp(599)).toBe(1);
  });

  it("returns level 2 at 600 XP (first threshold where floor(sqrt(xp/150)) = 2)", async () => {
    const { levelFromTotalXp } = await import("../XpService");
    // floor(sqrt(600/150)) = floor(sqrt(4)) = floor(2) = 2
    expect(levelFromTotalXp(600)).toBe(2);
  });

  it("returns level 1 for negative XP (treated as ≤ 0)", async () => {
    const { levelFromTotalXp } = await import("../XpService");
    expect(levelFromTotalXp(-100)).toBe(1);
  });
});

describe("xpToNextLevel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a positive threshold for level 1", async () => {
    const { xpToNextLevel } = await import("../XpService");
    const threshold = xpToNextLevel(1);
    expect(threshold).toBeGreaterThan(0);
  });

  it("returns a positive threshold for level 2", async () => {
    const { xpToNextLevel } = await import("../XpService");
    expect(xpToNextLevel(2)).toBeGreaterThan(0);
  });

  it("thresholds increase as level increases", async () => {
    const { xpToNextLevel } = await import("../XpService");
    expect(xpToNextLevel(2)).toBeGreaterThan(xpToNextLevel(1));
  });
});

describe("levelFromTotalXp / xpToNextLevel boundary consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("XP equal to xpToNextLevel(2) produces level 3 via levelFromTotalXp", async () => {
    const { levelFromTotalXp, xpToNextLevel } = await import("../XpService");
    // xpToNextLevel(2) = 3² × 150 = 1350
    // levelFromTotalXp(1350) = floor(sqrt(1350/150)) = floor(sqrt(9)) = floor(3) = 3
    const threshold = xpToNextLevel(2);
    expect(levelFromTotalXp(threshold)).toBe(3);
  });

  it("XP one below xpToNextLevel(2) keeps level 2", async () => {
    const { levelFromTotalXp, xpToNextLevel } = await import("../XpService");
    const threshold = xpToNextLevel(2);
    // At threshold - 1: still level 2
    expect(levelFromTotalXp(threshold - 1)).toBe(2);
  });
});

describe("awardMatchXp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.xpEvent.create.mockResolvedValue({});
    prismaMock.xpEvent.createMany.mockResolvedValue({ count: 0 });
  });

  it("creates one XpEvent per player", async () => {
    const { awardMatchXp } = await import("../XpService");

    prismaMock.xpEvent.groupBy.mockResolvedValue([
      { userId: "u1", _sum: { amount: 0 } },
      { userId: "u2", _sum: { amount: 0 } },
    ]);

    await awardMatchXp("room-1", [
      { playerId: "u1", rank: 1, totalPlayers: 2, score: 0 },
      { playerId: "u2", rank: 2, totalPlayers: 2, score: 0 },
    ]);

    expect(prismaMock.xpEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ userId: "u1", amount: 800 }),
        expect.objectContaining({ userId: "u2", amount: 200 }),
      ],
      skipDuplicates: true,
    });
  });

  it("rank-1 player receives win bonus (500) + base (100) + placement XP", async () => {
    const { awardMatchXp } = await import("../XpService");

    // totalPlayers=1, rank=1, score=0
    // placementRatio = 1 (since totalPlayers <= 1)
    // placementXp = round(1 * 200) = 200
    // winBonus = 500
    // scoreXp = max(0, round(0/10)) = 0
    // xpAwarded = 100 + 200 + 500 + 0 = 800
    prismaMock.xpEvent.groupBy.mockResolvedValue([
      { userId: "u1", _sum: { amount: 0 } },
    ]);

    const results = await awardMatchXp("room-1", [
      { playerId: "u1", rank: 1, totalPlayers: 1, score: 0 },
    ]);

    expect(results[0].xpAwarded).toBe(800);
  });

  it("xpToNextLevel in result is relative (remaining XP), not absolute threshold", async () => {
    const { awardMatchXp } = await import("../XpService");

    // Player starts at 0 XP. Awards 800 XP (rank=1, totalPlayers=1, score=0).
    // newTotalXp = 800
    // newLevel = floor(sqrt(800/150)) = floor(sqrt(5.333)) = floor(2.309) = 2
    // nextLevelThreshold = (2+1)² × 150 = 9 × 150 = 1350
    // xpToNextLevel = max(0, 1350 - 800) = 550
    prismaMock.xpEvent.groupBy.mockResolvedValue([
      { userId: "u1", _sum: { amount: 0 } },
    ]);

    const results = await awardMatchXp("room-1", [
      { playerId: "u1", rank: 1, totalPlayers: 1, score: 0 },
    ]);

    expect(results[0].xpToNextLevel).toBe(550);
  });

  it("xpToNextLevel is always non-negative (max-0 guard holds at a level boundary)", async () => {
    const { awardMatchXp } = await import("../XpService");

    // Player starts at 550 XP. Awards 800 XP (rank=1, totalPlayers=1, score=0).
    // newTotalXp = 550 + 800 = 1350 = 3² × 150 — exactly at the level-3 threshold.
    // newLevel = floor(sqrt(1350/150)) = floor(sqrt(9)) = floor(3) = 3
    // nextLevelThreshold = (3+1)² × 150 = 2400
    // xpToNextLevel = max(0, 2400-1350) = 1050 (always non-negative)
    prismaMock.xpEvent.groupBy.mockResolvedValue([
      { userId: "u1", _sum: { amount: 550 } },
    ]);

    const results = await awardMatchXp("room-1", [
      { playerId: "u1", rank: 1, totalPlayers: 1, score: 0 },
    ]);

    expect(results[0].xpToNextLevel).toBeGreaterThanOrEqual(0);
    expect(results[0].xpToNextLevel).toBe(1050);
  });

  it("sets didLevelUp true when player crosses a level boundary", async () => {
    const { awardMatchXp } = await import("../XpService");

    // Start at 599 XP → level 1 (floor(sqrt(599/150)) = floor(1.998) = 1)
    // Award 800 XP → newTotalXp = 1399
    // newLevel = floor(sqrt(1399/150)) = floor(sqrt(9.327)) = floor(3.054) = 3
    // prevLevel=1, newLevel=3 → didLevelUp=true
    prismaMock.xpEvent.groupBy.mockResolvedValue([
      { userId: "u1", _sum: { amount: 599 } },
    ]);

    const results = await awardMatchXp("room-1", [
      { playerId: "u1", rank: 1, totalPlayers: 1, score: 0 },
    ]);

    expect(results[0].didLevelUp).toBe(true);
  });
});
