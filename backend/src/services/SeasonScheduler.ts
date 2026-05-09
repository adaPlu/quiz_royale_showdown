import { prisma } from "../models/prismaClient";
import { generateId } from "../utils/ulid";
import { logger } from "../utils/logger";
import { levelFromTotalXp } from "./XpService";

// XP awarded to top finishers at season end
const SEASON_REWARDS: Record<number, number> = { 1: 500, 2: 300, 3: 150 };
const TOP_N = 3;

export async function processExpiredSeasons(): Promise<void> {
  const now = new Date();

  const expiredSeasons = await prisma.season.findMany({
    where: { endsAt: { lt: now }, rewardsAwardedAt: null },
    select: { id: true, name: true },
  });

  if (!expiredSeasons.length) return;

  for (const season of expiredSeasons) {
    try {
      const claimed = await prisma.$executeRaw`
        UPDATE "Season" SET "rewardsAwardedAt" = NOW()
        WHERE id = ${season.id} AND "rewardsAwardedAt" IS NULL
      `;
      if (claimed === 0) continue;
      await awardSeasonRewards(season.id, season.name);
      logger.info("Season rewards awarded", { seasonId: season.id, name: season.name });
    } catch (err) {
      logger.error("Failed to award season rewards", {
        seasonId: season.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function awardSeasonRewards(seasonId: string, seasonName: string): Promise<void> {
  const topScores = await prisma.seasonScore.findMany({
    where: { seasonId },
    orderBy: { mmr: "desc" },
    take: TOP_N,
    select: { userId: true, mmr: true },
  });

  if (!topScores.length) return;

  // Fetch current XP totals for level-up detection
  const userIds = topScores.map((s) => s.userId);
  const xpSums = await prisma.xpEvent.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds } },
    _sum: { amount: true },
  });
  const currentXpMap = new Map(xpSums.map((r) => [r.userId, r._sum.amount ?? 0]));

  const events = topScores
    .map((score, i) => {
      const rank = i + 1;
      const xp = SEASON_REWARDS[rank];
      if (!xp) return null;
      return { userId: score.userId, rank, xp };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  for (const event of events) {
    const prevXp = currentXpMap.get(event.userId) ?? 0;
    await prisma.xpEvent.create({
      data: {
        id: generateId(),
        userId: event.userId,
        reason: `SEASON_END:${seasonId}`,
        amount: event.xp,
        metadata: { seasonId, seasonName, rank: event.rank, mmr: topScores[event.rank - 1]?.mmr },
      },
    });
    const newLevel = levelFromTotalXp(prevXp + event.xp);
    const oldLevel = levelFromTotalXp(prevXp);
    if (newLevel > oldLevel) {
      logger.info("Season end level-up", { userId: event.userId, oldLevel, newLevel });
    }
  }

  // Grant season cosmetics to top-3 finishers
  for (const event of events) {
    const { userId, rank } = event;
    const code = `season:rank_${rank}`;
    const cosmetic = await prisma.cosmetic.findFirst({ where: { code } });
    if (cosmetic) {
      await prisma.userCosmetic.upsert({
        where: { userId_cosmeticId: { userId, cosmeticId: cosmetic.id } },
        update: {},
        create: { id: generateId(), userId, cosmeticId: cosmetic.id },
      });
    } else {
      logger.warn("Season cosmetic not found", { code });
    }
  }
}

export function startSeasonScheduler(): void {
  void processExpiredSeasons(); // run once on boot
  setInterval(() => void processExpiredSeasons(), 60 * 60 * 1000); // hourly
  logger.info("Season scheduler started (hourly)");
}
