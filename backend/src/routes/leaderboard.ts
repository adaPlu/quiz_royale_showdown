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

// GET /leaderboard/season — current active season standings (auth required)
router.get("/season", requireAuth, async (req, res, next) => {
  try {
    const now = new Date();
    const season = await prisma.season.findFirst({
      where: { startsAt: { lte: now }, endsAt: { gte: now } },
      orderBy: { startsAt: "desc" },
    });

    if (!season) {
      return res.json({ season: null, rankings: [] });
    }

    const standings = await prisma.seasonScore.findMany({
      where: { seasonId: season.id },
      orderBy: { mmr: "desc" },
      take: 100,
      include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
    });

    return res.json({
      season: { id: season.id, name: season.name, endsAt: season.endsAt },
      rankings: standings.map((row, index) => ({
        rank: index + 1,
        userId: row.userId,
        displayName: row.user.displayName,
        avatarUrl: row.user.avatarUrl,
        mmr: row.mmr,
        wins: row.wins,
        gamesPlayed: row.gamesPlayed,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /leaderboard/friends — authenticated user's friends leaderboard by total XP
router.get("/friends", requireAuth, async (req, res, next) => {
  try {
    const userId = req.jwtClaims!.sub;

    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ requesterId: userId }, { addresseeId: userId }],
        status: "ACCEPTED",
      },
      select: { requesterId: true, addresseeId: true },
    });

    const friendIds = friendships.map((f) =>
      f.requesterId === userId ? f.addresseeId : f.requesterId,
    );
    const allIds = [userId, ...friendIds];

    const [users, xpSums] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: allIds } },
        select: { id: true, displayName: true, avatarUrl: true },
      }),
      prisma.xpEvent.groupBy({
        by: ["userId"],
        where: { userId: { in: allIds } },
        _sum: { amount: true },
      }),
    ]);

    const xpMap = new Map(xpSums.map((row) => [row.userId, row._sum.amount ?? 0]));
    const userMap = new Map(users.map((u) => [u.id, u]));

    const ranked = allIds
      .map((id) => {
        const user = userMap.get(id);
        const totalXp = xpMap.get(id) ?? 0;
        return {
          userId: id,
          displayName: user?.displayName ?? id,
          avatarUrl: user?.avatarUrl ?? null,
          totalXp,
          level: levelFromTotalXp(totalXp),
        };
      })
      .sort((a, b) => b.totalXp - a.totalXp)
      .map((entry, index) => ({ rank: index + 1, ...entry }));

    res.json(ranked);
  } catch (err) {
    next(err);
  }
});

export default router;
