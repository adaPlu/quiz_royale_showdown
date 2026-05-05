import { timingSafeEqual, createHash } from "crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";

import { env } from "../config/env";
import { prisma } from "../models/prismaClient";
import { questionGeneratorService } from "../services/QuestionGeneratorService";

export const adminRouter = Router();

const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

const requireAdminSecret = (req: Request, res: Response, next: NextFunction): void => {
  const provided = String(req.headers["x-admin-secret"] ?? req.headers["x-admin-key"] ?? "");
  const expected = env.adminSecret;
  const a = Buffer.from(createHash("sha256").update(provided).digest());
  const b = Buffer.from(createHash("sha256").update(expected).digest());
  if (!timingSafeEqual(a, b)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
};

adminRouter.use(adminLimiter);
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
