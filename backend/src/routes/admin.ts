import { Router, type Request, type Response, type NextFunction } from "express";

import { env } from "../config/env";
import { prisma } from "../models/prismaClient";
import { questionGeneratorService } from "../services/QuestionGeneratorService";

export const adminRouter = Router();

function requireAdminSecret(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers["x-admin-key"] ?? req.query["adminKey"];
  if (key !== env.adminSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

adminRouter.use(requireAdminSecret);

// GET /api/v1/admin/questions/count
adminRouter.get("/questions/count", async (_req, res, next) => {
  try {
    const total = await prisma.questionBank.count();
    const active = await prisma.questionBank.count({ where: { isActive: true } });
    res.json({ total, active });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/questions/generate  — AI generation
adminRouter.post("/questions/generate", async (req, res, next) => {
  try {
    if (!questionGeneratorService.isAvailable) {
      res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });
      return;
    }
    const target = Number((req.body as Record<string, unknown>).count ?? 200);
    // Fire and forget — respond immediately, generation runs in background
    void questionGeneratorService.generateAndStore(target).catch(() => null);
    res.json({ message: `AI question generation started (target: ${target})`, status: "running" });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/questions/refill  — auto-refill if below threshold
adminRouter.post("/questions/refill", async (_req, res, next) => {
  try {
    void questionGeneratorService.refillIfNeeded().catch(() => null);
    res.json({ message: "Refill check triggered" });
  } catch (err) {
    next(err);
  }
});
