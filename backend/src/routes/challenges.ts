import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { prisma } from "../models/prismaClient";
import { generateId } from "../utils/ulid";

const router = Router();

// Deterministic daily challenge seed — changes each calendar day
function todayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

const DAILY_CHALLENGE_TEMPLATES = [
  { id: "win_a_game",       title: "Victory Lap",       description: "Win a game",              target: 1,  xpReward: 200 },
  { id: "answer_10",        title: "Quick Draw",         description: "Answer 10 questions correctly", target: 10, xpReward: 150 },
  { id: "top_3",            title: "Podium Finish",     description: "Finish in the top 3",     target: 3,  xpReward: 100 },
  { id: "use_powerup",      title: "Power Player",       description: "Use a power-up",          target: 1,  xpReward: 75  },
  { id: "play_3_games",     title: "Hat Trick",          description: "Play 3 games today",      target: 3,  xpReward: 125 },
  { id: "streak_5",         title: "On Fire",            description: "Get a 5-answer streak",   target: 5,  xpReward: 175 },
];

function selectTodaysChallenges(): typeof DAILY_CHALLENGE_TEMPLATES {
  // Rotate through 3 challenges based on today's date
  const key = todayKey();
  const seed = key.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const shuffled = [...DAILY_CHALLENGE_TEMPLATES].sort(
    (a, b) => ((seed * a.id.length) % 7) - ((seed * b.id.length) % 7),
  );
  return shuffled.slice(0, 3);
}

// GET /challenges/daily — today's challenges with user progress
router.get("/daily", requireAuth, async (req, res, next) => {
  try {
    const userId = req.jwtClaims!.sub;
    const today = todayKey();
    const challenges = selectTodaysChallenges();

    // Load progress rows for today from DB (stored as XpEvent with reason = "CHALLENGE:<id>:<date>")
    const progressRows = await prisma.xpEvent.findMany({
      where: {
        userId,
        reason: { startsWith: `CHALLENGE:` },
        createdAt: { gte: new Date(`${today}T00:00:00Z`) },
      },
    });

    const progressMap = new Map(
      progressRows.map((row) => {
        const parts = row.reason.split(":");
        return [parts[1], row.amount];
      }),
    );

    res.json(
      challenges.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        target: c.target,
        xpReward: c.xpReward,
        progress: Math.min(progressMap.get(c.id) ?? 0, c.target),
        completed: (progressMap.get(c.id) ?? 0) >= c.target,
      })),
    );
  } catch (err) {
    next(err);
  }
});

const progressBodySchema = z.object({ delta: z.number().int().min(1).max(100) });
const challengeIdParamsSchema = z.object({ id: z.string().min(1).max(64) });

// POST /challenges/:id/progress — record progress toward a challenge
router.post("/:id/progress", requireAuth, validate({ params: challengeIdParamsSchema }), async (req, res, next) => {
  try {
    const userId = req.jwtClaims!.sub;
    const challengeId = req.params.id;
    const parsed = progressBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid delta", details: parsed.error.flatten() });
    const delta = parsed.data.delta;
    const today = todayKey();

    const template = DAILY_CHALLENGE_TEMPLATES.find((c) => c.id === challengeId);
    if (!template) return res.status(404).json({ error: "Challenge not found" });

    const existing = await prisma.xpEvent.findFirst({
      where: { userId, reason: `CHALLENGE:${challengeId}:${today}` },
    });

    const currentProgress = existing?.amount ?? 0;
    const newProgress = Math.min(currentProgress + delta, template.target);
    const justCompleted = currentProgress < template.target && newProgress >= template.target;

    if (existing) {
      await prisma.xpEvent.update({
        where: { id: existing.id },
        data: { amount: newProgress },
      });
    } else {
      await prisma.xpEvent.create({
        data: {
          id: generateId(),
          userId,
          reason: `CHALLENGE:${challengeId}:${today}`,
          amount: newProgress,
        },
      });
    }

    if (justCompleted) {
      await prisma.xpEvent.create({
        data: {
          id: generateId(),
          userId,
          reason: `CHALLENGE_REWARD:${challengeId}:${today}`,
          amount: template.xpReward,
          metadata: { challengeId, today },
        },
      });
    }

    res.json({ progress: newProgress, target: template.target, completed: newProgress >= template.target, justCompleted });
  } catch (err) {
    next(err);
  }
});

export default router;
