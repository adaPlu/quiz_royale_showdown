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

export default router;
