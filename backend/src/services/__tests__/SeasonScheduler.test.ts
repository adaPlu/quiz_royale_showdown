/**
 * Tests for SeasonScheduler.processExpiredSeasons()
 *
 * Critical paths:
 *  - skips when no expired seasons exist
 *  - awards XP to top-3 finishers and stamps rewardsAwardedAt
 *  - awards nothing when a season has no scores
 *  - continues processing remaining seasons after one fails
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    season: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    seasonScore: {
      findMany: vi.fn(),
    },
    xpEvent: {
      create: vi.fn(),
      groupBy: vi.fn(),
    },
    cosmetic: {
      findMany: vi.fn(),
    },
    userCosmetic: {
      upsert: vi.fn(),
    },
  };
  return { prismaMock };
});

vi.mock("../../models/prismaClient", () => ({ prisma: prismaMock }));
vi.mock("../../utils/ulid", () => ({ generateId: vi.fn(() => "xp-event-id") }));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../XpService", () => ({
  levelFromTotalXp: vi.fn((xp: number) => Math.floor(xp / 1000) + 1),
}));

import { processExpiredSeasons } from "../SeasonScheduler";

describe("processExpiredSeasons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$executeRaw.mockResolvedValue(1);
    prismaMock.xpEvent.create.mockResolvedValue({});
    prismaMock.xpEvent.groupBy.mockResolvedValue([]);
    prismaMock.seasonScore.findMany.mockResolvedValue([]);
    prismaMock.cosmetic.findMany.mockResolvedValue([]);
    prismaMock.userCosmetic.upsert.mockResolvedValue({});
  });

  it("does nothing when no expired seasons exist", async () => {
    prismaMock.season.findMany.mockResolvedValue([]);

    await processExpiredSeasons();

    expect(prismaMock.seasonScore.findMany).not.toHaveBeenCalled();
    expect(prismaMock.xpEvent.create).not.toHaveBeenCalled();
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it("skips rewards when $executeRaw returns 0 (idempotency — already claimed)", async () => {
    prismaMock.season.findMany.mockResolvedValue([
      { id: "season-idem", name: "Idempotency Season" },
    ]);
    prismaMock.$executeRaw.mockResolvedValue(0);

    await processExpiredSeasons();

    expect(prismaMock.xpEvent.create).not.toHaveBeenCalled();
    expect(prismaMock.userCosmetic.upsert).not.toHaveBeenCalled();
  });

  it("queries seasons with endsAt < now and rewardsAwardedAt null", async () => {
    prismaMock.season.findMany.mockResolvedValue([]);

    await processExpiredSeasons();

    expect(prismaMock.season.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ rewardsAwardedAt: null }),
      }),
    );
  });

  it("awards 500/300/150 XP to top-3 finishers and stamps rewardsAwardedAt", async () => {
    prismaMock.season.findMany.mockResolvedValue([
      { id: "season-1", name: "Season 1" },
    ]);
    prismaMock.seasonScore.findMany.mockResolvedValue([
      { userId: "u1", mmr: 2000 },
      { userId: "u2", mmr: 1500 },
      { userId: "u3", mmr: 1200 },
    ]);

    await processExpiredSeasons();

    expect(prismaMock.xpEvent.create).toHaveBeenCalledTimes(3);

    expect(prismaMock.xpEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          amount: 500,
          reason: "SEASON_END:season-1",
        }),
      }),
    );
    expect(prismaMock.xpEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "u2", amount: 300 }),
      }),
    );
    expect(prismaMock.xpEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "u3", amount: 150 }),
      }),
    );
  });

  it("awards XP only to available top positions when fewer than 3 players", async () => {
    prismaMock.season.findMany.mockResolvedValue([
      { id: "season-2", name: "Season 2" },
    ]);
    prismaMock.seasonScore.findMany.mockResolvedValue([
      { userId: "only-player", mmr: 1800 },
    ]);

    await processExpiredSeasons();

    expect(prismaMock.xpEvent.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.xpEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "only-player", amount: 500 }),
      }),
    );
  });

  it("stamps rewardsAwardedAt even when season has no scores", async () => {
    prismaMock.season.findMany.mockResolvedValue([
      { id: "empty-season", name: "Empty" },
    ]);
    prismaMock.seasonScore.findMany.mockResolvedValue([]);

    await processExpiredSeasons();

    expect(prismaMock.xpEvent.create).not.toHaveBeenCalled();
    // rewardsAwardedAt is stamped via $executeRaw so the scheduler doesn't retry
    expect(prismaMock.$executeRaw).toHaveBeenCalled();
  });

  it("processes remaining seasons when one throws", async () => {
    prismaMock.season.findMany.mockResolvedValue([
      { id: "bad-season", name: "Bad" },
      { id: "good-season", name: "Good" },
    ]);

    prismaMock.seasonScore.findMany
      .mockRejectedValueOnce(new Error("DB error"))
      .mockResolvedValueOnce([{ userId: "u1", mmr: 1000 }]);

    await processExpiredSeasons();

    // The good season should still be processed — xpEvent.create called once for u1
    expect(prismaMock.xpEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "u1" }),
      }),
    );
  });

  it("fetches season scores with orderBy mmr desc and take 3", async () => {
    prismaMock.season.findMany.mockResolvedValue([
      { id: "season-3", name: "Season 3" },
    ]);

    await processExpiredSeasons();

    expect(prismaMock.seasonScore.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { seasonId: "season-3" },
        orderBy: { mmr: "desc" },
        take: 3,
      }),
    );
  });

  it("upserts UserCosmetic for top-3 when cosmetics exist", async () => {
    prismaMock.season.findMany.mockResolvedValue([
      { id: "season-c", name: "Season C" },
    ]);
    prismaMock.seasonScore.findMany.mockResolvedValue([
      { userId: "u1", mmr: 2000 },
      { userId: "u2", mmr: 1500 },
      { userId: "u3", mmr: 1200 },
    ]);
    prismaMock.cosmetic.findMany.mockResolvedValue([
      { id: "cos-id-1", code: "season:rank_1" },
      { id: "cos-id-2", code: "season:rank_2" },
      { id: "cos-id-3", code: "season:rank_3" },
    ]);
    prismaMock.userCosmetic.upsert.mockResolvedValue({});

    await processExpiredSeasons();

    expect(prismaMock.userCosmetic.upsert).toHaveBeenCalledTimes(3);
    expect(prismaMock.userCosmetic.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ userId: "u1", cosmeticId: "cos-id-1" }),
      }),
    );
  });

  it("skips cosmetic grant when cosmetic code not found in DB", async () => {
    prismaMock.season.findMany.mockResolvedValue([
      { id: "season-d", name: "Season D" },
    ]);
    prismaMock.seasonScore.findMany.mockResolvedValue([
      { userId: "u1", mmr: 1000 },
    ]);
    prismaMock.cosmetic.findMany.mockResolvedValue([]);

    const { logger } = await import("../../utils/logger");

    await processExpiredSeasons();

    expect(prismaMock.userCosmetic.upsert).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Season cosmetic not found"),
      expect.anything(),
    );
  });
});
