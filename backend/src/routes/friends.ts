import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { prisma } from "../models/prismaClient";
import { levelFromTotalXp } from "../services/XpService";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors";
import { generateId, isValidId } from "../utils/ulid";

const router = Router();

router.use(requireAuth);

const requestBodySchema = z.object({
  addresseeId: z.string().trim().refine(isValidId, "addresseeId must be a valid ULID"),
});

const friendshipIdParamsSchema = z.object({
  friendshipId: z.string().trim().refine(isValidId, "friendshipId must be a valid ULID"),
});

router.get("/", async (req, res, next) => {
  try {
    const userId = req.jwtClaims!.sub;

    const friendships = await prisma.friendship.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      include: {
        requester: { select: { id: true, displayName: true, avatarUrl: true, rating: true } },
        addressee: { select: { id: true, displayName: true, avatarUrl: true, rating: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    res.json(
      friendships.map((friendship) => {
        const friend = friendship.requesterId === userId ? friendship.addressee : friendship.requester;
        return { friendshipId: friendship.id, ...friend, since: friendship.updatedAt };
      }),
    );
  } catch (error) {
    next(error);
  }
});

router.get("/pending", async (req, res, next) => {
  try {
    const userId = req.jwtClaims!.sub;

    const pending = await prisma.friendship.findMany({
      where: { addresseeId: userId, status: "PENDING" },
      include: {
        requester: { select: { id: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(
      pending.map((friendship) => ({
        friendshipId: friendship.id,
        ...friendship.requester,
        requestedAt: friendship.createdAt,
      })),
    );
  } catch (error) {
    next(error);
  }
});

router.post("/request", validate({ body: requestBodySchema }), async (req, res, next) => {
  try {
    const userId = req.jwtClaims!.sub;
    const { addresseeId } = req.body as z.infer<typeof requestBodySchema>;

    if (addresseeId === userId) {
      throw new BadRequestError("Cannot send a friend request to yourself");
    }

    const addressee = await prisma.user.findUnique({
      where: { id: addresseeId },
      select: { id: true },
    });
    if (!addressee) {
      throw new NotFoundError("User not found");
    }

    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, addresseeId },
          { requesterId: addresseeId, addresseeId: userId },
        ],
      },
    });

    if (existing?.status === "ACCEPTED") {
      throw new ConflictError("Already friends");
    }
    if (existing?.status === "BLOCKED") {
      throw new ForbiddenError("Cannot send request");
    }
    if (existing) {
      throw new ConflictError("Friend request already pending");
    }

    const friendship = await prisma.friendship.create({
      data: {
        id: generateId(),
        requesterId: userId,
        addresseeId,
        status: "PENDING",
      },
    });

    res.status(201).json({ friendshipId: friendship.id, status: friendship.status });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      next(new ConflictError("Friendship already exists"));
      return;
    }
    next(error);
  }
});

router.put("/:friendshipId/accept", validate({ params: friendshipIdParamsSchema }), async (req, res, next) => {
  try {
    const userId = req.jwtClaims!.sub;
    const { friendshipId } = req.params as z.infer<typeof friendshipIdParamsSchema>;

    const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) {
      throw new NotFoundError("Friendship not found");
    }

    if (friendship.addresseeId !== userId) {
      throw new ForbiddenError("Only the recipient can accept a friend request");
    }

    if (friendship.status !== "PENDING") {
      throw new ConflictError(`Cannot accept a request with status ${friendship.status}`);
    }

    const updated = await prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: "ACCEPTED" },
    });

    res.json({ friendshipId: updated.id, status: updated.status });
  } catch (error) {
    next(error);
  }
});

router.delete("/:friendshipId", validate({ params: friendshipIdParamsSchema }), async (req, res, next) => {
  try {
    const userId = req.jwtClaims!.sub;
    const { friendshipId } = req.params as z.infer<typeof friendshipIdParamsSchema>;

    const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) {
      throw new NotFoundError("Friendship not found");
    }

    if (friendship.requesterId !== userId && friendship.addresseeId !== userId) {
      throw new ForbiddenError("Access denied");
    }

    await prisma.friendship.delete({ where: { id: friendshipId } });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get("/leaderboard", async (req, res, next) => {
  try {
    const userId = req.jwtClaims!.sub;

    const friendships = await prisma.friendship.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      select: { requesterId: true, addresseeId: true },
    });
    const friendIds = friendships.map((friendship) =>
      friendship.requesterId === userId ? friendship.addresseeId : friendship.requesterId,
    );
    const userIds = [...new Set([userId, ...friendIds])];

    const [users, xpSums] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true, avatarUrl: true },
      }),
      prisma.xpEvent.groupBy({
        by: ["userId"],
        where: { userId: { in: userIds } },
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
  } catch (error) {
    next(error);
  }
});

export default router;
