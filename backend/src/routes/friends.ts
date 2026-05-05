import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { prisma } from "../models/prismaClient";
import { levelFromTotalXp } from "../services/XpService";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors";
import { generateId } from "../utils/ulid";

const friendsRouter = Router();

const requestBodySchema = z.object({
  addresseeId: z.string().min(1).max(64),
});

// POST /friends/request — send a friend request
friendsRouter.post(
  "/request",
  requireAuth,
  validate({ body: requestBodySchema }),
  async (req, res, next) => {
    try {
      const userId = req.jwtClaims!.sub;
      const { addresseeId } = req.body as z.infer<typeof requestBodySchema>;

      if (userId === addresseeId) {
        throw new BadRequestError("Cannot send a friend request to yourself");
      }

      const existing = await prisma.friendship.findFirst({
        where: {
          OR: [
            { requesterId: userId, addresseeId },
            { requesterId: addresseeId, addresseeId: userId },
          ],
        },
      });

      if (existing) {
        throw new ConflictError("Friendship already exists");
      }

      const friendship = await prisma.friendship.create({
        data: {
          id: generateId(),
          requesterId: userId,
          addresseeId,
        },
      });

      res.status(201).json(friendship);
    } catch (err) {
      next(err);
    }
  }
);

// GET /friends — list accepted friends
friendsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const userId = req.jwtClaims!.sub;

    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: userId, status: "ACCEPTED" },
          { addresseeId: userId, status: "ACCEPTED" },
        ],
      },
      include: {
        requester: { select: { id: true, displayName: true, avatarUrl: true } },
        addressee: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    const friends = friendships.map((f) => {
      const friend = f.requesterId === userId ? f.addressee : f.requester;
      return {
        friendshipId: f.id,
        status: f.status,
        ...friend,
      };
    });

    res.json({ friends });
  } catch (err) {
    next(err);
  }
});

// PUT /friends/:id/accept — accept a pending friend request
friendsRouter.put("/:id/accept", requireAuth, async (req, res, next) => {
  try {
    const userId = req.jwtClaims!.sub;
    const id = String(req.params.id);

    const friendship = await prisma.friendship.findFirst({
      where: { id, addresseeId: userId, status: "PENDING" },
    });

    if (!friendship) {
      throw new NotFoundError("Friend request not found");
    }

    const updated = await prisma.friendship.update({
      where: { id },
      data: { status: "ACCEPTED" },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /friends/pending — list incoming pending friend requests (addressee view)
friendsRouter.get("/pending", requireAuth, async (req, res, next) => {
  try {
    const userId = req.jwtClaims!.sub;

    const pendingFriendships = await prisma.friendship.findMany({
      where: {
        addresseeId: userId,
        status: "PENDING",
      },
      include: {
        requester: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    const pending = pendingFriendships.map((f) => ({
      friendshipId: f.id,
      requester: f.requester,
      createdAt: f.createdAt,
    }));

    res.json({ pending });
  } catch (err) {
    next(err);
  }
});

// DELETE /friends/:id — remove a friend or decline a request
friendsRouter.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const userId = req.jwtClaims!.sub;
    const id = String(req.params.id);

    const friendship = await prisma.friendship.findFirst({
      where: {
        id,
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
    });

    if (!friendship) {
      throw new NotFoundError("Friendship not found");
    }

    await prisma.friendship.delete({ where: { id } });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// GET /friends/leaderboard — self + accepted friends sorted by total XP
friendsRouter.get("/leaderboard", requireAuth, async (req, res, next) => {
  try {
    const userId = req.jwtClaims!.sub;

    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: userId, status: "ACCEPTED" },
          { addresseeId: userId, status: "ACCEPTED" },
        ],
      },
    });

    const friendIds = friendships.map((f) =>
      f.requesterId === userId ? f.addresseeId : f.requesterId
    );
    const allIds = [...new Set([userId, ...friendIds])];

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

    const leaderboard = users
      .map((user) => {
        const totalXp = xpMap.get(user.id) ?? 0;
        return { ...user, totalXp, level: levelFromTotalXp(totalXp) };
      })
      .sort((a, b) => b.totalXp - a.totalXp)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));

    res.json({ leaderboard });
  } catch (err) {
    next(err);
  }
});

export default friendsRouter;
