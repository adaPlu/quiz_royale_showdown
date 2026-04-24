/**
 * Generate trivia questions via Claude AI and store them in the DB.
 * Run: npm run generate:questions -w backend [count]
 * Example: npm run generate:questions -w backend 500
 *
 * Requires ANTHROPIC_API_KEY in environment / .env
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

import { questionGeneratorService } from "../services/QuestionGeneratorService";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const target = parseInt(process.argv[2] ?? "200", 10);

  if (!questionGeneratorService.isAvailable) {
    console.error("ANTHROPIC_API_KEY is not set. Add it to your .env file.");
    process.exit(1);
  }

  const before = await prisma.questionBank.count();
  console.log(`DB currently has ${before} questions. Generating ~${target} more...\n`);

  const added = await questionGeneratorService.generateAndStore(target);

  const after = await prisma.questionBank.count();
  console.log(`\nDone! Added ${added} questions. Total in DB: ${after}`);
}

main()
  .catch(console.error)
  .finally(() => void prisma.$disconnect());
