import { timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";

import { env } from "../config/env";
import { adminLimiter } from "../middleware/rateLimiter";
import { validate } from "../middleware/validate";
import { prisma } from "../models/prismaClient";
import { questionGeneratorService } from "../services/QuestionGeneratorService";
import { logger } from "../utils/logger";
import { generateId } from "../utils/ulid";

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

const requireAdminSecret = (req: Request, res: Response, next: NextFunction): void => {
  const key = getAdminHeader(req);
  if (!key || !adminSecretMatches(key)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

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

// POST /api/v1/admin/questions/generate  — AI generation
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

// POST /api/v1/admin/questions/refill  — auto-refill if below threshold
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

const questionIdParamsSchema = z.object({
  id: z.string().ulid("Question ID must be a valid ULID"),
});

const questionSchema = z.object({
  prompt: z.string().min(5),
  optionA: z.string().min(1),
  optionB: z.string().min(1),
  optionC: z.string().min(1),
  optionD: z.string().min(1),
  correctIndex: z.number().int().min(0).max(3),
  category: z.string().min(1),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
});

// GET /api/v1/admin/questions  — paginated list
adminRouter.get("/questions", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const activeOnly = req.query.active === "true";
    const where = activeOnly ? { isActive: true } : {};
    const [total, questions] = await Promise.all([
      prisma.questionBank.count({ where }),
      prisma.questionBank.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: { id: true, prompt: true, optionA: true, optionB: true, optionC: true, optionD: true, correctIndex: true, category: true, difficulty: true, isActive: true, lastUsedAt: true, createdAt: true },
      }),
    ]);
    res.json({ total, page, limit, questions });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/questions  — manual create
adminRouter.post("/questions", async (req, res, next) => {
  try {
    const parsed = questionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
      return;
    }
    const question = await prisma.questionBank.create({
      data: { id: generateId(), ...parsed.data, isActive: true },
    });
    res.status(201).json(question);
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/admin/questions/:id  — update fields
adminRouter.put("/questions/:id", async (req, res, next) => {
  try {
    const idParsed = questionIdParamsSchema.safeParse(req.params);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid question ID", issues: idParsed.error.issues });
      return;
    }
    const parsed = questionSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
      return;
    }
    const question = await prisma.questionBank.update({
      where: { id: idParsed.data.id },
      data: parsed.data,
    });
    res.json(question);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/admin/questions/:id  — soft-delete (isActive = false)
adminRouter.delete("/questions/:id", async (req, res, next) => {
  try {
    const idParsed = questionIdParamsSchema.safeParse(req.params);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid question ID", issues: idParsed.error.issues });
      return;
    }
    await prisma.questionBank.update({
      where: { id: idParsed.data.id },
      data: { isActive: false },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/admin/questions/:id/activate  — restore soft-deleted question
adminRouter.patch("/questions/:id/activate", async (req, res, next) => {
  try {
    const idParsed = questionIdParamsSchema.safeParse(req.params);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid question ID", issues: idParsed.error.issues });
      return;
    }
    const question = await prisma.questionBank.update({
      where: { id: idParsed.data.id },
      data: { isActive: true },
    });
    res.json(question);
  } catch (err) {
    next(err);
  }
});
