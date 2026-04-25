/**
 * Targeted AI question generation for under-represented categories.
 * Run: npx tsx src/scripts/generateTargeted.ts
 * Requires OPENAI_API_KEY in .env
 */

import "dotenv/config";
import OpenAI from "openai";
import { Difficulty, PrismaClient } from "@prisma/client";
import { ulid } from "ulid";

const prisma = new PrismaClient();

// Categories with <100 questions — target 150 each
const TARGETS = [
  { name: "Art",             topic: "famous paintings, sculptures, artists, art movements, museums, art history", target: 150 },
  { name: "Literature",      topic: "classic novels, authors, poetry, literary characters, book awards, fiction", target: 150 },
  { name: "Mathematics",     topic: "arithmetic, algebra, geometry, famous mathematicians, number theory, puzzles", target: 150 },
  { name: "Politics",        topic: "world leaders, elections, political systems, government, historic political events", target: 150 },
  { name: "Current Events",  topic: "world news 2022-2025, global events, major headlines, international affairs", target: 150 },
  { name: "Science & Nature",topic: "biology, chemistry, physics, ecology, animals, plants, natural phenomena", target: 150 },
  { name: "Food & Drink",    topic: "world cuisines, cocktails, cooking techniques, famous chefs, ingredients, food history", target: 150 },
  { name: "Pop Culture",     topic: "viral trends, memes, celebrities, reality TV, social media, internet culture 2015-2025", target: 150 },
  { name: "Music",           topic: "pop, hip-hop, rock, R&B, country, music awards, albums, music history, famous songs", target: 150 },
  { name: "Technology & AI", topic: "AI tools, tech companies, gadgets, programming, social media platforms, startups, apps", target: 150 },
  { name: "Gaming",          topic: "video game history, popular games, esports, gaming consoles, game characters, speedruns", target: 150 },
  { name: "Business",        topic: "famous CEOs, companies, stock market, startups, business history, economics basics", target: 100 },
  { name: "Movies",          topic: "film history, directors, actors, Oscar winners, box office records, movie trivia", target: 150 },
  { name: "Television",      topic: "TV shows, sitcoms, dramas, streaming, reality TV, classic TV, Emmy winners", target: 100 },
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

async function generateBatch(client: OpenAI, category: string, topic: string, count: number): Promise<AIQuestion[]> {
  const completion = await client.chat.completions.create({
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

Return a JSON object with key "questions" containing an array. Each element:
{
  "prompt": "Question text ending with ?",
  "optionA": "First choice",
  "optionB": "Second choice",
  "optionC": "Third choice",
  "optionD": "Fourth choice",
  "correctIndex": 2,
  "category": "${category}",
  "difficulty": "MEDIUM"
}

Rules:
- correctIndex 0=A 1=B 2=C 3=D — distribute randomly across all values
- All 4 options must be plausible and distinct
- Factually accurate only — no guesses
- Mix: 35% EASY, 45% MEDIUM, 20% HARD
- No duplicate questions
- Self-contained questions only`,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content ?? "";
  const parsed = JSON.parse(text) as { questions?: unknown[] };
  const items = Array.isArray(parsed.questions) ? parsed.questions : [];

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

async function storeQuestion(q: AIQuestion): Promise<boolean> {
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

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY not set in .env");
    process.exit(1);
  }

  const client = new OpenAI({ apiKey });
  const before = await prisma.questionBank.count();
  console.log(`\nDB currently has ${before} questions.`);
  console.log(`Generating targeted batches for ${TARGETS.length} thin categories...\n`);

  let grandTotal = 0;

  for (const cat of TARGETS) {
    const existing = await prisma.questionBank.count({ where: { category: cat.name } });
    const needed = Math.max(0, cat.target - existing);

    if (needed === 0) {
      console.log(`  ${cat.name.padEnd(22)} already has ${existing} ✓`);
      continue;
    }

    process.stdout.write(`  ${cat.name.padEnd(22)} (${existing} → ${cat.target}) generating ${needed}...`);

    try {
      // Split into batches of 50 max per API call
      let added = 0;
      let remaining = needed;
      while (remaining > 0) {
        const batchSize = Math.min(50, remaining);
        const questions = await generateBatch(client, cat.name, cat.topic, batchSize);
        for (const q of questions) {
          if (await storeQuestion(q)) added++;
        }
        remaining -= batchSize;
      }
      grandTotal += added;
      console.log(` +${added}`);
    } catch (err) {
      console.log(` ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const after = await prisma.questionBank.count();
  console.log(`\nDone! Added ${grandTotal} questions. Total in DB: ${after}\n`);
}

main()
  .catch(console.error)
  .finally(() => void prisma.$disconnect());
