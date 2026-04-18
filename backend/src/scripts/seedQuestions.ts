import { PrismaClient } from "@prisma/client";
import { generateId } from "../utils/ulid";

const prisma = new PrismaClient();
const BATCH = 50;
const TOTAL = 500;

interface OTDBQuestion {
  category: string;
  type: string;
  difficulty: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

function decodeHtml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"');
}

async function fetchBatch(amount: number, retries = 3): Promise<OTDBQuestion[]> {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(
        `https://opentdb.com/api.php?amount=${amount}&type=multiple`
      );
      const data = (await resp.json()) as {
        response_code: number;
        results: OTDBQuestion[];
      };
      if (data.response_code === 0) return data.results;
      if (data.response_code === 5) {
        console.log("Rate limited — waiting 5s");
        await new Promise((r) => setTimeout(r, 5000));
      }
    } catch (e) {
      console.warn(`Fetch attempt ${i + 1} failed:`, e);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return [];
}

async function main() {
  console.log(`Seeding ${TOTAL} questions from Open Trivia DB...`);
  let inserted = 0;
  const batches = Math.ceil(TOTAL / BATCH);

  for (let b = 0; b < batches; b++) {
    const questions = await fetchBatch(BATCH);
    if (questions.length === 0) {
      console.warn(`Batch ${b + 1} returned 0 questions`);
      continue;
    }

    for (const q of questions) {
      const decodedQuestion = decodeHtml(q.question);
      const decodedCorrect = decodeHtml(q.correct_answer);
      const decodedIncorrect = q.incorrect_answers.map(decodeHtml);

      // Build four options with the correct answer shuffled into a random slot
      const incorrectCopy = [...decodedIncorrect];
      const correctIndex = Math.floor(Math.random() * 4);
      const options: string[] = [];
      let incorrectIdx = 0;
      for (let slot = 0; slot < 4; slot++) {
        if (slot === correctIndex) {
          options.push(decodedCorrect);
        } else {
          options.push(incorrectCopy[incorrectIdx++] ?? "");
        }
      }

      await prisma.questionBank.create({
        data: {
          id: generateId(),
          category: decodeHtml(q.category),
          difficulty: q.difficulty.toUpperCase() as "EASY" | "MEDIUM" | "HARD",
          prompt: decodedQuestion,
          optionA: options[0],
          optionB: options[1],
          optionC: options[2],
          optionD: options[3],
          correctIndex,
          isActive: true,
        },
      });
      inserted++;
    }

    console.log(
      `Batch ${b + 1}/${batches} done — ${inserted}/${TOTAL} questions inserted`
    );
    if (b < batches - 1) await new Promise((r) => setTimeout(r, 1500)); // avoid rate limit
  }

  console.log(`Done. ${inserted} questions in question_bank.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
