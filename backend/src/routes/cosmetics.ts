import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../models/prismaClient";
import { z } from "zod";
import { validate } from "../middleware/validate";
import { ForbiddenError } from "../utils/errors";

const router = Router();

// GET /cosmetics — full catalog
router.get("/", async (_req, res, next) => {
  try {
    const cosmetics = await prisma.cosmetic.findMany({
      orderBy: [{ type: "asc" }],
    });
    res.json(cosmetics);
  } catch (err) {
    next(err);
  }
});

// GET /cosmetics/owned — current user's owned cosmetics
router.get("/owned", requireAuth, async (req, res, next) => {
  try {
    const userId = req.jwtClaims!.sub;
    const owned = await prisma.userCosmetic.findMany({
      where: { userId },
      include: { cosmetic: true },
    });
    res.json(owned);
  } catch (err) {
    next(err);
  }
});

// POST /cosmetics/equip — equip a cosmetic
const EquipSchema = z.object({ cosmeticId: z.string().min(1) });

router.post(
  "/equip",
  requireAuth,
  validate({ body: EquipSchema }),
  async (req, res, next) => {
    try {
      const userId = req.jwtClaims!.sub;
      const { cosmeticId } = req.body as z.infer<typeof EquipSchema>;

      const ownership = await prisma.userCosmetic.findUnique({
        where: { userId_cosmeticId: { userId, cosmeticId } },
        include: { cosmetic: true },
      });
      if (!ownership) throw new ForbiddenError("You do not own this cosmetic");

      // Unequip all same-type cosmetics then equip this one
      await prisma.$transaction([
        prisma.userCosmetic.updateMany({
          where: { userId, cosmetic: { type: ownership.cosmetic.type } },
          data: { equipped: false },
        }),
        prisma.userCosmetic.update({
          where: { userId_cosmeticId: { userId, cosmeticId } },
          data: { equipped: true },
        }),
      ]);

      res.json({ success: true, equipped: cosmeticId });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
