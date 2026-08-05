import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../models/prismaClient";

const router = Router();

// Deterministic daily challenge seed — changes each calendar day
function todayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

const DAILY_CHALLENGE_TEMPLATES = [
  { id: "win_a_game",       title: "Victory Lap",       description: "Win a game",                   target: 1,  xpReward: 200 },
  { id: "answer_10",        title: "Quick Draw",        description: "Answer 10 questions correctly", target: 10, xpReward: 150 },
  { id: "top_3",            title: "Podium Finish",     description: "Finish in the top 3",          target: 3,  xpReward: 100 },
  { id: "use_powerup",      title: "Power Player",      description: "Use a power-up",               target: 1,  xpReward: 75  },
  { id: "play_3_games",     title: "Hat Trick",         description: "Play 3 games today",           target: 3,  xpReward: 125 },
  { id: "streak_5",         title: "On Fire",           description: "Get a 5-answer streak",        target: 5,  xpReward: 175 },
];

function selectTodaysChallenges(): typeof DAILY_CHALLENGE_TEMPLATES {
  const key = todayKey();
  const seed = key.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const shuffled = [...DAILY_CHALLENGE_TEMPLATES].sort(
    (a, b) => ((seed * a.id.length) % 7) - ((seed * b.id.length) % 7),
  );
  return shuffled.slice(0, 3);
}

// GET /challenges/daily — today's challenges with server-recorded progress.
router.get("/daily", requireAuth, async (req, res, next) => {
  try {
    const userId = req.jwtClaims!.sub;
    const today = todayKey();
    const challenges = selectTodaysChallenges();

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
      challenges.map((challenge) => ({
        id: challenge.id,
        title: challenge.title,
        description: challenge.description,
        target: challenge.target,
        xpReward: challenge.xpReward,
        progress: Math.min(progressMap.get(challenge.id) ?? 0, challenge.target),
        completed: (progressMap.get(challenge.id) ?? 0) >= challenge.target,
      })),
    );
  } catch (err) {
    next(err);
  }
});

// Challenge progress is intentionally not writable by clients. Progress and
// rewards must be produced by trusted game, answer, and power-up transactions.
router.post("/:id/progress", requireAuth, (_req, res) => {
  res.status(403).json({
    code: "SERVER_AUTHORITATIVE_PROGRESS",
    message: "Challenge progress is awarded automatically from verified gameplay.",
  });
});

export default router;
