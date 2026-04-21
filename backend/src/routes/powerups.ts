import { Router } from "express";

import { requireAuth } from "../middleware/auth";
import { getPowerUpInventory } from "../services/PowerUpService";

const router = Router();

// GET /powerups/inventory - list user's canonical power-ups
router.get("/inventory", requireAuth, async (req, res, next) => {
  try {
    const userId = req.jwtClaims!.sub;
    const items = await getPowerUpInventory(userId);
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// POST /powerups/use - activation is server-authoritative via WebSocket in Phase 2.
router.post("/use", requireAuth, async (_req, res) => {
  res.status(501).json({
    code: "USE_VIA_WEBSOCKET",
    message: "Power-up activation must be sent via the WebSocket powerup:activate event",
  });
});

export default router;
