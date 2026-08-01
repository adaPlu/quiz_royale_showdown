import { timingSafeEqual } from "node:crypto";

import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";

import { env } from "../config/env";
import { adminLimiter } from "../middleware/rateLimiter";
import { validate } from "../middleware/validate";
import { prisma } from "../models/prismaClient";
import { questionGeneratorService } from "../services/QuestionGeneratorService";
import { logger } from "../utils/logger";

export const adminRouter = Router();

const DEFAULT_GENERATE_COUNT = 200;
const MAX_GENERATE_COUNT = 500;

const generateQuestionsSchema = z.object({
  count: z
    .preprocess((value) => value ?? DEFAULT_GENERATE_COUNT, z.coerce.number().int().min(1))
    .transform((count) => Math.min(count, MAX_GENERATE_COUNT))
}).default({ count: DEFAULT_GENERATE_COUNT });

function getAdminHeader(req: Request): string | null {
  const key = req.headers["x-admin-key"];
  return typeof key === "string" ? key : null;
}

function adminSecretMatches(candidate: string): boolean {
  const candidateBuffer = Buffer.from(candidate);
  const secretBuffer = Buffer.from(env.adminSecret);

  return candidateBuffer.length === secretBuffer.length && timingSafeEqual(candidateBuffer, secretBuffer);
}

function requireAdminSecret(req: Request, res: Response, next: NextFunction): void {
  const key = getAdminHeader(req);
  if (!key || !adminSecretMatches(key)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

adminRouter.use(adminLimiter, requireAdminSecret);

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

// POST /api/v1/admin/questions/generate - AI generation
adminRouter.post("/questions/generate", validate({ body: generateQuestionsSchema }), async (req, res, next) => {
  try {
    if (!questionGeneratorService.isAvailable) {
      res.status(503).json({ error: "OPENAI_API_KEY not configured" });
      return;
    }

    const { count: target } = req.body as z.infer<typeof generateQuestionsSchema>;
    // Respond immediately; generation continues in the background.
    void questionGeneratorService.generateAndStore(target).catch((error: unknown) => {
      logger.error("AI question generation failed", { error });
    });

    res.json({ message: `AI question generation started (target: ${target})`, status: "running" });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/questions/refill - auto-refill if below threshold
adminRouter.post("/questions/refill", async (_req, res, next) => {
  try {
    void questionGeneratorService.refillIfNeeded().catch((error: unknown) => {
      logger.error("AI question refill failed", { error });
    });

    res.json({ message: "Refill check triggered" });
  } catch (err) {
    next(err);
  }
});
