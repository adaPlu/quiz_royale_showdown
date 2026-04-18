import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../models/prismaClient";
import { NotFoundError } from "../utils/errors";

const router = Router();

// GET /users/me — current authenticated user's profile
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const userId = req.jwtClaims!.sub;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        rating: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundError("User not found");
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// GET /users/search?q=term — friend discovery by displayName
router.get("/search", requireAuth, async (req, res, next) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) return res.json([]);
    const users = await prisma.user.findMany({
      where: { displayName: { contains: q, mode: "insensitive" } },
      select: { id: true, displayName: true, avatarUrl: true, rating: true },
      take: 20,
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

// GET /users/:displayName/profile — public profile
router.get("/:displayName/profile", async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({
      where: { displayName: req.params.displayName },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        rating: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundError("User not found");
    res.json(user);
  } catch (err) {
    next(err);
  }
});

export default router;
