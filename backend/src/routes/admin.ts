import { timingSafeEqual, createHash } from "crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { env } from "../config/env";
import { prisma } from "../models/prismaClient";
import { questionGeneratorService } from "../services/QuestionGeneratorService";
import { generateId } from "../utils/ulid";

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
      res.status(503).json({ error: "OPENAI_API_KEY not configured" });
      return;
    }
    const target = Math.min(Number((req.body as any).count ?? 200), 500);
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
