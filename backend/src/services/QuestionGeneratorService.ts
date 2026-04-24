import OpenAI from "openai";
import { Difficulty, PrismaClient } from "@prisma/client";
import { ulid } from "ulid";

import { logger } from "../utils/logger";

const prisma = new PrismaClient();

const REFILL_THRESHOLD = 500;
const BATCH_SIZE = 30;

const AI_CATEGORIES = [
  { name: "Technology & AI",   topic: "artificial intelligence, machine learning, popular apps, social media platforms, tech companies" },
  { name: "Pop Culture",       topic: "movies, TV shows, celebrity news, viral internet trends, memes, 2020-2025" },
  { name: "Science",           topic: "biology, chemistry, physics, space exploration, environmental science" },
  { name: "History",           topic: "world history, ancient civilizations, wars, political events" },
  { name: "Sports",            topic: "football, basketball, soccer, Olympics, famous athletes, world records" },
  { name: "Geography",         topic: "countries, capitals, famous landmarks, rivers, mountains, continents" },
  { name: "Gaming",            topic: "video games, esports, gaming history, Fortnite, Minecraft, PlayStation, Xbox" },
  { name: "Food & Drink",      topic: "world cuisines, cooking techniques, famous chefs, ingredients, restaurants" },
  { name: "Music",             topic: "pop music, rap, rock, famous artists, albums, music history 2000-2025" },
  { name: "Current Events",    topic: "recent world events, politics, business news, scientific discoveries 2020-2025" },
];

interface AIQuestion {
  prompt: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctIndex: number;
  category: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
}

function toDifficulty(d: string): Difficulty {
  if (d === "HARD") return Difficulty.HARD;
  if (d === "MEDIUM") return Difficulty.MEDIUM;
  return Difficulty.EASY;
}

export class QuestionGeneratorService {
  private readonly client: OpenAI | null;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  get isAvailable(): boolean {
    return this.client !== null;
  }

  async generateAndStore(targetCount = 200): Promise<number> {
    if (!this.client) {
      logger.warn("AI question generation skipped — OPENAI_API_KEY not set");
      return 0;
    }

    let total = 0;
    const perCategory = Math.max(BATCH_SIZE, Math.ceil(targetCount / AI_CATEGORIES.length));

    for (const cat of AI_CATEGORIES) {
      try {
        const questions = await this.generateBatch(cat.name, cat.topic, perCategory);
        let added = 0;
        for (const q of questions) {
          if (await this.storeQuestion(q)) added++;
        }
        total += added;
        logger.info("AI questions generated", { category: cat.name, added });
      } catch (err) {
        logger.error("AI generation failed for category", {
          category: cat.name,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info("AI question generation complete", { total });
    return total;
  }

  async refillIfNeeded(): Promise<void> {
    if (!this.client) return;
    const count = await prisma.questionBank.count({ where: { isActive: true } });
    if (count >= REFILL_THRESHOLD) return;
    logger.info("Question bank below threshold — triggering AI refill", { count, threshold: REFILL_THRESHOLD });
    void this.generateAndStore(REFILL_THRESHOLD - count + 100).catch((err: unknown) => {
      logger.error("Background AI refill failed", { message: err instanceof Error ? err.message : String(err) });
    });
  }

  private async generateBatch(category: string, topic: string, count: number): Promise<AIQuestion[]> {
    const completion = await this.client!.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a trivia question generator. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: `Generate ${count} unique multiple-choice trivia questions about: ${topic}.

Return a JSON object with a single key "questions" containing an array. Each element:
{
  "prompt": "Question text ending with ?",
  "optionA": "First choice",
  "optionB": "Second choice",
  "optionC": "Third choice",
  "optionD": "Fourth choice",
  "correctIndex": 1,
  "category": "${category}",
  "difficulty": "EASY"
}

Rules:
- correctIndex is 0 (A), 1 (B), 2 (C), or 3 (D) — vary it randomly
- All 4 options must be plausible (no obviously silly wrong answers)
- Factually accurate only
- Mix difficulties: roughly 40% EASY, 40% MEDIUM, 20% HARD
- No duplicate questions
- Questions must be self-contained`,
        },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(text) as { questions?: unknown[] };
    const items = parsed.questions ?? [];

    return items.filter((q): q is AIQuestion => {
      const item = q as Partial<AIQuestion>;
      return (
        typeof item.prompt === "string" &&
        typeof item.optionA === "string" &&
        typeof item.optionB === "string" &&
        typeof item.optionC === "string" &&
        typeof item.optionD === "string" &&
        typeof item.correctIndex === "number" &&
        item.correctIndex >= 0 &&
        item.correctIndex <= 3
      );
    });
  }

  private async storeQuestion(q: AIQuestion): Promise<boolean> {
    const existing = await prisma.questionBank.findFirst({ where: { prompt: q.prompt } });
    if (existing) return false;

    await prisma.questionBank.create({
      data: {
        id: ulid(),
        prompt: q.prompt,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        optionD: q.optionD,
        correctIndex: q.correctIndex,
        category: q.category,
        difficulty: toDifficulty(q.difficulty),
        isActive: true,
      },
    });
    return true;
  }
}

export const questionGeneratorService = new QuestionGeneratorService();
