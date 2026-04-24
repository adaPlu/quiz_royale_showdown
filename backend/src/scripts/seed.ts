/**
 * Database seed script.
 *
 * Run with:  npm run seed -w backend
 *
 * Seeds:
 *  - Power-up definitions (5 types)
 *  - Cosmetic items (starter set)
 *  - Sample questions from Open Trivia DB categories
 *  - Season 1 (if none exists)
 */

import "dotenv/config";
import { PrismaClient, Difficulty } from "@prisma/client";
import { ulid } from "ulid";

const prisma = new PrismaClient();

// ─── Power-ups ───────────────────────────────────────────────────────────────

const POWER_UPS = [
  {
    code: "DOUBLE_DOWN",
    name: "Double Down",
    description: "Double your score for this round if correct.",
    rarity: "COMMON",
    cooldownSecs: 0
  },
  {
    code: "FIFTY_FIFTY",
    name: "50/50",
    description: "Eliminate 2 wrong answers.",
    rarity: "COMMON",
    cooldownSecs: 0
  },
  {
    code: "TIME_FREEZE",
    name: "Time Freeze",
    description: "Pause the countdown for 5 seconds.",
    rarity: "RARE",
    cooldownSecs: 0
  },
  {
    code: "SHIELD",
    name: "Shield",
    description: "Protect yourself from elimination this round.",
    rarity: "RARE",
    cooldownSecs: 0
  },
  {
    code: "SABOTAGE",
    name: "Sabotage",
    description: "Force a target player to skip this question.",
    rarity: "EPIC",
    cooldownSecs: 0
  }
] as const;

// ─── Cosmetics ───────────────────────────────────────────────────────────────

const COSMETICS = [
  {
    code: "AVATAR_DEFAULT",
    type: "AVATAR" as const,
    name: "Default Avatar",
    assetUrl: "https://assets.quizroyale.io/cosmetics/avatar-default.webp",
    rarity: "COMMON"
  },
  {
    code: "FRAME_GOLD",
    type: "FRAME" as const,
    name: "Gold Frame",
    assetUrl: "https://assets.quizroyale.io/cosmetics/frame-gold.webp",
    rarity: "RARE"
  },
  {
    code: "TITLE_CHAMPION",
    type: "TITLE" as const,
    name: "Champion",
    assetUrl: "https://assets.quizroyale.io/cosmetics/title-champion.webp",
    rarity: "EPIC"
  }
] as const;

// ─── Sample questions ─────────────────────────────────────────────────────────

const QUESTIONS: Array<{
  prompt: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctIndex: number;
  category: string;
  difficulty: Difficulty;
}> = [
  {
    prompt: "What is the capital of France?",
    optionA: "Berlin",
    optionB: "Madrid",
    optionC: "Paris",
    optionD: "Rome",
    correctIndex: 2,
    category: "Geography",
    difficulty: Difficulty.EASY
  },
  {
    prompt: "Which planet is known as the Red Planet?",
    optionA: "Jupiter",
    optionB: "Venus",
    optionC: "Saturn",
    optionD: "Mars",
    correctIndex: 3,
    category: "Science",
    difficulty: Difficulty.EASY
  },
  {
    prompt: "Who wrote 'To Kill a Mockingbird'?",
    optionA: "Harper Lee",
    optionB: "J.K. Rowling",
    optionC: "Ernest Hemingway",
    optionD: "Mark Twain",
    correctIndex: 0,
    category: "Literature",
    difficulty: Difficulty.MEDIUM
  },
  {
    prompt: "What is the chemical symbol for gold?",
    optionA: "Go",
    optionB: "Gd",
    optionC: "Au",
    optionD: "Ag",
    correctIndex: 2,
    category: "Science",
    difficulty: Difficulty.MEDIUM
  },
  {
    prompt: "In which year did the Berlin Wall fall?",
    optionA: "1985",
    optionB: "1989",
    optionC: "1991",
    optionD: "1993",
    correctIndex: 1,
    category: "History",
    difficulty: Difficulty.MEDIUM
  },
  {
    prompt: "What is the speed of light in a vacuum (km/s)?",
    optionA: "150,000",
    optionB: "200,000",
    optionC: "299,792",
    optionD: "340",
    correctIndex: 2,
    category: "Science",
    difficulty: Difficulty.HARD
  },
  {
    prompt: "Which element has atomic number 79?",
    optionA: "Silver",
    optionB: "Platinum",
    optionC: "Copper",
    optionD: "Gold",
    correctIndex: 3,
    category: "Science",
    difficulty: Difficulty.HARD
  },
  {
    prompt: "What is the largest ocean on Earth?",
    optionA: "Atlantic",
    optionB: "Indian",
    optionC: "Arctic",
    optionD: "Pacific",
    correctIndex: 3,
    category: "Geography",
    difficulty: Difficulty.EASY
  },
  {
    prompt: "Who painted the Mona Lisa?",
    optionA: "Michelangelo",
    optionB: "Leonardo da Vinci",
    optionC: "Raphael",
    optionD: "Botticelli",
    correctIndex: 1,
    category: "Art",
    difficulty: Difficulty.EASY
  },
  {
    prompt: "What is the square root of 144?",
    optionA: "11",
    optionB: "12",
    optionC: "13",
    optionD: "14",
    correctIndex: 1,
    category: "Mathematics",
    difficulty: Difficulty.EASY
  }
];

// ─── Auto-seed (called on startup) ───────────────────────────────────────────

export async function autoSeedIfEmpty(): Promise<void> {
  const count = await prisma.questionBank.count();
  if (count > 0) return;
  console.log("Question bank is empty — running seed…");
  await main();
}

// ─── Main seed ────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding database…");

  // Power-ups (upsert by code)
  for (const pu of POWER_UPS) {
    await prisma.powerUp.upsert({
      where: { code: pu.code },
      update: {},
      create: {
        id: ulid(),
        ...pu,
        isActive: true
      }
    });
  }
  console.log(`  ✓ ${POWER_UPS.length} power-ups seeded`);

  // Cosmetics
  for (const cosmetic of COSMETICS) {
    await prisma.cosmetic.upsert({
      where: { code: cosmetic.code },
      update: {},
      create: {
        id: ulid(),
        ...cosmetic
      }
    });
  }
  console.log(`  ✓ ${COSMETICS.length} cosmetics seeded`);

  // Questions
  for (const q of QUESTIONS) {
    const existing = await prisma.questionBank.findFirst({
      where: { prompt: q.prompt }
    });
    if (!existing) {
      await prisma.questionBank.create({
        data: { id: ulid(), ...q, isActive: true }
      });
    }
  }
  console.log(`  ✓ ${QUESTIONS.length} questions seeded`);

  // Season 1
  const season1Slug = "season-1";
  await prisma.season.upsert({
    where: { slug: season1Slug },
    update: {},
    create: {
      id: ulid(),
      slug: season1Slug,
      name: "Season 1: Royale Beginnings",
      startsAt: new Date("2026-05-01T00:00:00Z"),
      endsAt: new Date("2026-07-31T23:59:59Z")
    }
  });
  console.log("  ✓ Season 1 seeded");

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
