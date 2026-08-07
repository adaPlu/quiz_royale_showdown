import { timingSafeEqual } from "node:crypto";

import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";

import { env } from "../config/env";
import { adminLimiter } from "../middleware/rateLimiter";
import { validate } from "../middleware/validate";
import { prisma } from "../models/prismaClient";
import { questionGeneratorService } from "../services/QuestionGeneratorService";

export const adminRouter = Router();

const DEFAULT_GENERATE_COUNT = env.questionRefillBatchSize;
const MAX_GENERATE_COUNT = 60;

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

adminRouter.get("/questions/count", async (_req, res, next) => {
  try {
    const total = await prisma.questionBank.count();
    const active = await prisma.questionBank.count({ where: { isActive: true } });
    res.json({ total, active });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/questions/generate", validate({ body: generateQuestionsSchema }), async (req, res, next) => {
  try {
    if (!questionGeneratorService.isAvailable) {
      res.status(503).json({ error: "OPENAI_API_KEY not configured" });
      return;
    }

    const { count: target } = req.body as z.infer<typeof generateQuestionsSchema>;
    const added = await questionGeneratorService.generateAndStore(target);

    res.json({
      message: "OpenAI question generation completed",
      status: "completed",
      requested: target,
      added,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/questions/refill", async (_req, res, next) => {
  try {
    await questionGeneratorService.refillIfNeeded();
    const active = await prisma.questionBank.count({ where: { isActive: true } });

    res.json({
      message: "OpenAI refill check completed",
      status: "completed",
      active,
    });
  } catch (err) {
    next(err);
  }
});
