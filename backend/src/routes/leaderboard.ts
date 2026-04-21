import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../models/prismaClient";
import { levelFromTotalXp } from "../services/XpService";

const router = Router();

// GET /leaderboard?season=current&limit=100
router.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const seasonSlug = String(req.query.season ?? "current");

    if (seasonSlug === "current" || seasonSlug) {
      const season = await prisma.season.findFirst({
        where: seasonSlug === "current"
          ? { startsAt: { lte: new Date() }, endsAt: { gte: new Date() } }
          : { slug: seasonSlug },
        orderBy: { startsAt: "desc" },
      });

      if (season) {
        const standings = await prisma.seasonScore.findMany({
          where: { seasonId: season.id },
          orderBy: { mmr: "desc" },
          take: limit,
          include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
        });

        return res.json(
          standings.map((row, index) => ({
            rank: index + 1,
            userId: row.userId,
            displayName: row.user.displayName,
            avatarUrl: row.user.avatarUrl,
            mmr: row.mmr,
            wins: row.wins,
            gamesPlayed: row.gamesPlayed,
          })),
        );
      }
    }

    // Fallback: all-time by total XP
    const xpSums = await prisma.xpEvent.groupBy({
      by: ["userId"],
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: limit,
    });

    const userIds = xpSums.map((row) => row.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, avatarUrl: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    res.json(
      xpSums.map((row, index) => {
        const totalXp = row._sum.amount ?? 0;
        const user = userMap.get(row.userId);
        return {
          rank: index + 1,
          userId: row.userId,
          displayName: user?.displayName ?? row.userId,
          avatarUrl: user?.avatarUrl ?? null,
          totalXp,
          level: levelFromTotalXp(totalXp),
        };
      }),
    );
  } catch (err) {
    next(err);
  }
});

// GET /leaderboard/friends — authenticated user's friends by rating
router.get("/friends", requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    // For now return top users by rating as friends leaderboard (friend graph not yet implemented)
    const users = await prisma.user.findMany({
      orderBy: { rating: "desc" },
      take: limit,
      select: { id: true, displayName: true, avatarUrl: true, rating: true },
    });
    res.json(
      users.map((user, index) => ({
        rank: index + 1,
        userId: user.id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        rating: user.rating,
      })),
    );
  } catch (err) {
    next(err);
  }
});

export default router;
