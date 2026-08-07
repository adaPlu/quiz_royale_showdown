import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../models/prismaClient";
import { levelFromTotalXp } from "../services/XpService";
import { resolvePublicDisplayName } from "../utils/publicDisplayName";
import { isGuestEmail } from "../utils/guestUsers";

const router = Router();

function parseLimit(value: unknown): number {
  const parsed = Number(value ?? 100);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 500) : 100;
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit);
    const seasonSlug = String(req.query.season ?? "current");
    const guestFilter = { email: { not: { endsWith: "@guest.quizroyale.invalid" } } };

    if (seasonSlug) {
      const season = await prisma.season.findFirst({
        where: seasonSlug === "current"
          ? { startsAt: { lte: new Date() }, endsAt: { gte: new Date() } }
          : { slug: seasonSlug },
        orderBy: { startsAt: "desc" },
      });
      if (season) {
        const standings = await prisma.seasonScore.findMany({
          where: { seasonId: season.id, user: guestFilter },
          orderBy: { mmr: "desc" },
          take: limit,
          include: { user: { select: { id: true, email: true, displayName: true, avatarUrl: true } } },
        });
        return res.json(standings.filter((row) => !isGuestEmail(row.user.email)).map((row, index) => ({
          rank: index + 1,
          userId: row.userId,
          displayName: resolvePublicDisplayName(row.user.displayName, row.userId),
          avatarUrl: row.user.avatarUrl,
          mmr: row.mmr,
          wins: row.wins,
          gamesPlayed: row.gamesPlayed,
        })));
      }
    }

    const xpSums = await prisma.xpEvent.groupBy({
      by: ["userId"],
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: Math.min(limit * 2, 500),
    });
    const users = await prisma.user.findMany({
      where: { id: { in: xpSums.map((row) => row.userId) }, ...guestFilter },
      select: { id: true, email: true, displayName: true, avatarUrl: true },
    });
    const userMap = new Map(users.filter((user) => !isGuestEmail(user.email)).map((user) => [user.id, user]));
    const rows = xpSums.filter((row) => userMap.has(row.userId)).slice(0, limit);
    res.json(rows.map((row, index) => {
      const totalXp = row._sum.amount ?? 0;
      const user = userMap.get(row.userId)!;
      return {
        rank: index + 1,
        userId: row.userId,
        displayName: resolvePublicDisplayName(user.displayName, row.userId),
        avatarUrl: user.avatarUrl,
        totalXp,
        level: levelFromTotalXp(totalXp),
      };
    }));
  } catch (err) {
    next(err);
  }
});

router.get("/friends", requireAuth, async (_req, res, next) => {
  try { res.json([]); } catch (err) { next(err); }
});

export default router;
