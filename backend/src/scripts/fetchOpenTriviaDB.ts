/**
 * Imports questions from the free Open Trivia Database (opentdb.com).
 * Run: npm run fetch:opentdb -w backend
 *
 * Strategy: fetch each category × each difficulty (easy/medium/hard) = up to 50 per slice.
 * 20 categories × 3 difficulties × 50 = up to 3,000 questions — close to opentdb's full pool.
 *
 * Uses opentdb session tokens so duplicate questions are never returned mid-run.
 * Rate limit: 1 request per 5s per IP (enforced below).
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

const DIFFICULTIES = ["easy", "medium", "hard"] as const;

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

interface TokenResponse {
  response_code: number;
  token: string;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getSessionToken(): Promise<string | null> {
  try {
    const res = await fetch("https://opentdb.com/api_token.php?command=request");
    const json = (await res.json()) as TokenResponse;
    return json.response_code === 0 ? json.token : null;
  } catch {
    return null;
  }
}

async function fetchSlice(
  categoryId: number,
  difficulty: string,
  token: string | null,
): Promise<OpenTDBResult["results"]> {
  let url = `https://opentdb.com/api.php?amount=50&category=${categoryId}&difficulty=${difficulty}&type=multiple`;
  if (token) url += `&token=${token}`;

  const res = await fetch(url);
  if (!res.ok) return [];
  const json = (await res.json()) as OpenTDBResult;

  // 4 = token exhausted for this slice (all questions seen), treat as empty
  if (json.response_code === 4 || json.response_code === 1) return [];
  if (json.response_code !== 0) return [];

  return json.results;
}

function decodeHtml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rsquo;/g, "’")
    .replace(/&hellip;/g, "…")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
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
  console.log(`Starting import. DB currently has ${before} questions.`);
  console.log(`Fetching: ${CATEGORIES.length} categories × 3 difficulties × up to 50 = ~${CATEGORIES.length * 3 * 50} questions\n`);

  const token = await getSessionToken();
  if (token) {
    console.log(`Session token acquired (deduplication enabled)\n`);
  }

  let total = 0;
  let requestCount = 0;

  for (const cat of CATEGORIES) {
    let catTotal = 0;
    for (const difficulty of DIFFICULTIES) {
      if (requestCount > 0) {
        await wait(5200); // opentdb rate limit: 1 req / 5s
      }
      requestCount++;

      try {
        const questions = await fetchSlice(cat.id, difficulty, token);
        let added = 0;
        for (const q of questions) {
          if (await importQuestion(q)) added++;
        }
        catTotal += added;
        total += added;
        process.stdout.write(`  ${cat.name.padEnd(24)} [${difficulty.padEnd(6)}] +${added}\n`);
      } catch (err) {
        process.stdout.write(`  ${cat.name.padEnd(24)} [${difficulty.padEnd(6)}] ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
      }
    }
    console.log(`  → ${cat.name} subtotal: +${catTotal}\n`);
  }

  const after = await prisma.questionBank.count();
  console.log(`Import complete. Added ${total} new questions. Total in DB: ${after}`);
  const eta = Math.round((CATEGORIES.length * 3 * 5.2) / 60);
  console.log(`(Script takes ~${eta} min to run due to opentdb rate limiting)`);
}

main()
  .catch(console.error)
  .finally(() => void prisma.$disconnect());
