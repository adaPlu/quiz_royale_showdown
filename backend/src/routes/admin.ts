import { timingSafeEqual } from "node:crypto";

import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";

import { env } from "../config/env";
import { adminLimiter } from "../middleware/rateLimiter";
import { validate } from "../middleware/validate";
import { prisma } from "../models/prismaClient";
import { questionGeneratorService } from "../services/QuestionGeneratorService";
import { seasonPassService } from "../services/SeasonPassService";
import { generateId } from "../utils/ulid";

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

// ---------------------------------------------------------------------------
// SEASON-ADMIN
//
// Mounted on adminRouter, so it inherits adminLimiter + requireAdminSecret
// applied router-wide above. No route here declares its own guard, and none is
// declared before that .use() — verified by position in this file.
// ---------------------------------------------------------------------------

const createSeasonSchema = z.object({
  slug: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  premiumSku: z.string().trim().min(1).max(120),
  tierCount: z.coerce.number().int().min(1).max(200),
  xpPerTier: z.coerce.number().int().min(1).max(100_000),
});

const tierSchema = z
  .object({
    tier: z.coerce.number().int().min(1),
    track: z.enum(["FREE", "PREMIUM"]),
    cosmeticId: z.string().trim().optional(),
    powerUpId: z.string().trim().optional(),
    powerUpQuantity: z.coerce.number().int().min(0).default(0),
  })
  // Mirrors SeasonPassTier_single_reward_check so a bad payload is rejected at
  // the boundary with a 400 rather than surfacing as a database error.
  .refine(
    (t) =>
      (t.cosmeticId && !t.powerUpId) ||
      (!t.cosmeticId && t.powerUpId && t.powerUpQuantity > 0),
    { message: "A tier must grant exactly one of cosmeticId or powerUpId (with quantity > 0)" },
  );

adminRouter.post(
  "/seasons",
  validate({ body: createSeasonSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof createSeasonSchema>;
      if (body.endsAt <= body.startsAt) {
        res.status(400).json({ error: "endsAt must be after startsAt", code: "VALIDATION_ERROR" });
        return;
      }

      // Season and its pass are created together: a season without a pass would
      // activate the SeasonScore path (see SETTLE-RETRY) while leaving
      // progression unreachable, which is the half-live state to avoid.
      const created = await prisma.$transaction(async (tx) => {
        const season = await tx.season.create({
          data: {
            id: generateId(),
            slug: body.slug,
            name: body.name,
            startsAt: body.startsAt,
            endsAt: body.endsAt,
          },
        });
        const pass = await tx.seasonPass.create({
          data: {
            id: generateId(),
            seasonId: season.id,
            premiumSku: body.premiumSku,
            tierCount: body.tierCount,
            xpPerTier: body.xpPerTier,
          },
        });
        return { season, pass };
      });

      res.status(201).json({ seasonId: created.season.id, seasonPassId: created.pass.id });
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.post(
  "/seasons/:seasonPassId/tiers",
  validate({
    params: z.object({ seasonPassId: z.string().trim().min(1) }),
    body: z.object({ tiers: z.array(tierSchema).min(1).max(200) }),
  }),
  async (req, res, next) => {
    try {
      const { seasonPassId } = req.params as { seasonPassId: string };
      const { tiers } = req.body as { tiers: z.infer<typeof tierSchema>[] };

      const pass = await prisma.seasonPass.findUnique({
        where: { id: seasonPassId },
        select: { id: true, tierCount: true },
      });
      if (!pass) {
        res.status(404).json({ error: "Season pass not found", code: "NOT_FOUND" });
        return;
      }

      const outOfRange = tiers.filter((t) => t.tier > pass.tierCount);
      if (outOfRange.length > 0) {
        res.status(400).json({
          error: `Tier exceeds the pass tierCount of ${pass.tierCount}`,
          code: "VALIDATION_ERROR",
        });
        return;
      }

      // skipDuplicates makes re-running a tier definition safe: the
      // (seasonPassId, tier, track) unique absorbs repeats instead of 500ing.
      const result = await prisma.seasonPassTier.createMany({
        data: tiers.map((t) => ({
          id: generateId(),
          seasonPassId: pass.id,
          tier: t.tier,
          track: t.track,
          cosmeticId: t.cosmeticId ?? null,
          powerUpId: t.powerUpId ?? null,
          powerUpQuantity: t.powerUpQuantity,
        })),
        skipDuplicates: true,
      });

      res.status(201).json({ created: result.count, requested: tiers.length });
    } catch (err) {
      next(err);
    }
  },
);

// PREMIUM-PURCHASE (entitlement half).
//
// Store receipt verification against Apple/Google is deliberately NOT here — it
// needs provider credentials and is its own integration. These two endpoints are
// the entitlement side that such a flow would call once a receipt is validated,
// and they are what a refund webhook needs today.
adminRouter.post(
  "/season-pass/grant",
  validate({
    body: z.object({
      userId: z.string().trim().min(1),
      seasonPassId: z.string().trim().min(1),
      receiptId: z.string().trim().min(1),
    }),
  }),
  async (req, res, next) => {
    try {
      const { userId, seasonPassId, receiptId } = req.body as Record<string, string>;
      await seasonPassService.grantPremium(userId, seasonPassId, receiptId);
      res.json({ granted: true });
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.post(
  "/season-pass/revoke",
  validate({ body: z.object({ receiptId: z.string().trim().min(1) }) }),
  async (req, res, next) => {
    try {
      const { receiptId } = req.body as { receiptId: string };
      const revoked = await seasonPassService.revokePremiumForReceipt(receiptId);
      // Claims are untouched by design: a refunded player keeps what they
      // already claimed and loses access to the rest.
      res.json({ revokedPasses: revoked, claimsRemoved: 0 });
    } catch (err) {
      next(err);
    }
  },
);
