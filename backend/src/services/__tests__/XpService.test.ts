import { beforeEach, describe, expect, it, vi } from "vitest";

// Prisma mock required because XpService imports prismaClient at module level
const prismaMock = {
  xpEvent: {
    groupBy: vi.fn(),
    create: vi.fn(),
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
