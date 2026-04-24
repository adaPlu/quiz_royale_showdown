/**
 * Imports questions from the free Open Trivia Database (opentdb.com).
 * Run: npm run fetch:opentdb -w backend
 *
 * Rate limit: opentdb allows 1 request per 5s per IP.
 * Total: ~21 categories × 50 questions = up to 1,050 questions added.
 */

import "dotenv/config";
import { Difficulty, PrismaClient } from "@prisma/client";
import { ulid } from "ulid";

const prisma = new PrismaClient();

const CATEGORIES = [
  { id: 9,  name: "General Knowledge" },
  { id: 10, name: "Books" },
  { id: 11, name: "Film" },
  { id: 12, name: "Music" },
  { id: 14, name: "Television" },
  { id: 15, name: "Video Games" },
  { id: 17, name: "Science & Nature" },
  { id: 18, name: "Technology" },
  { id: 19, name: "Mathematics" },
  { id: 20, name: "Mythology" },
  { id: 21, name: "Sports" },
  { id: 22, name: "Geography" },
  { id: 23, name: "History" },
  { id: 25, name: "Art" },
  { id: 26, name: "Celebrities" },
  { id: 27, name: "Animals" },
  { id: 28, name: "Vehicles" },
  { id: 30, name: "Gadgets" },
  { id: 31, name: "Anime & Manga" },
  { id: 32, name: "Cartoons & Animation" },
];

interface OpenTDBResult {
  response_code: number;
  results: Array<{
    category: string;
    difficulty: string;
    question: string;
    correct_answer: string;
    incorrect_answers: string[];
  }>;
}

function decodeHtml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&hellip;/g, "…")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è")
    .replace(/&agrave;/g, "à")
    .replace(/&aacute;/g, "á")
    .replace(/&iacute;/g, "í")
    .replace(/&oacute;/g, "ó")
    .replace(/&uacute;/g, "ú")
    .replace(/&ntilde;/g, "ñ")
    .replace(/&ccedil;/g, "ç")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 10)));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

function toDifficulty(d: string): Difficulty {
  if (d === "hard") return Difficulty.HARD;
  if (d === "medium") return Difficulty.MEDIUM;
  return Difficulty.EASY;
}

async function fetchCategory(categoryId: number): Promise<OpenTDBResult["results"]> {
  const url = `https://opentdb.com/api.php?amount=50&category=${categoryId}&type=multiple`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = (await res.json()) as OpenTDBResult;
  if (json.response_code !== 0) return [];
  return json.results;
}

async function importQuestion(q: OpenTDBResult["results"][number]): Promise<boolean> {
  const prompt = decodeHtml(q.question);
  const existing = await prisma.questionBank.findFirst({ where: { prompt } });
  if (existing) return false;

  const correct = decodeHtml(q.correct_answer);
  const wrong = q.incorrect_answers.map(decodeHtml);
  if (wrong.length !== 3) return false;

  const options = shuffle([correct, ...wrong]);
  const correctIndex = options.indexOf(correct);
  if (correctIndex === -1 || options.length !== 4) return false;

  await prisma.questionBank.create({
    data: {
      id: ulid(),
      prompt,
      optionA: options[0] as string,
      optionB: options[1] as string,
      optionC: options[2] as string,
      optionD: options[3] as string,
      correctIndex,
      category: q.category,
      difficulty: toDifficulty(q.difficulty),
      isActive: true,
    },
  });
  return true;
}

async function main(): Promise<void> {
  const before = await prisma.questionBank.count();
  console.log(`Starting import. DB currently has ${before} questions.\n`);

  let total = 0;

  for (const cat of CATEGORIES) {
    process.stdout.write(`  ${cat.name.padEnd(30)}`);
    try {
      const questions = await fetchCategory(cat.id);
      let added = 0;
      for (const q of questions) {
        if (await importQuestion(q)) added++;
      }
      console.log(`+${added}`);
      total += added;
    } catch (err) {
      console.log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
    // Respect opentdb rate limit (1 req / 5s)
    await new Promise((resolve) => setTimeout(resolve, 5200));
  }

  const after = await prisma.questionBank.count();
  console.log(`\nImport complete. Added ${total} questions. Total: ${after}`);
}

main()
  .catch(console.error)
  .finally(() => void prisma.$disconnect());
