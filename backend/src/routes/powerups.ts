import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../models/prismaClient";

const router = Router();

// GET /powerups/inventory — list user's power-ups
router.get("/inventory", requireAuth, async (req, res, next) => {
  try {
    const userId = req.jwtClaims!.sub;
    const items = await prisma.playerPowerUp.findMany({
      where: { userId },
      include: { powerUp: true },
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// POST /powerups/use — use a power-up in a game (enforced via WebSocket in Phase 2)
router.post("/use", requireAuth, async (_req, res) => {
  // Full server enforcement via WebSocket handler (src/socket/handlers/usePowerup.ts)
  // This REST endpoint is for inventory deduction confirmation only
  res.status(501).json({
    code: "USE_VIA_WEBSOCKET",
    message: "Power-up activation must be sent via WebSocket v1:use_powerup event",
  });
});

export default router;
