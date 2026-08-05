import OpenAI from "openai";
import { Difficulty } from "@prisma/client";
import { z } from "zod";

import { env } from "../config/env";
import { prisma } from "../models/prismaClient";
import { logger } from "../utils/logger";
import { generateId } from "../utils/ulid";
import { redisService } from "./RedisService";

const DEFAULT_REFILL_THRESHOLD = 60;
const DEFAULT_BATCH_SIZE = 30;
const MAX_BATCH_SIZE = 60;
const REFILL_LOCK_SECONDS = 300;
const REFILL_LOCK_KEY = "questions:ai-refill-lock";
const MODEL = process.env.OPENAI_QUESTION_MODEL?.trim() || "gpt-5-mini";

const AI_CATEGORIES = [
  "Technology and AI", "Science", "World History", "Sports", "Geography",
  "Gaming", "Food and Drink", "Music", "Film and Television", "General Knowledge"
] as const;

const generatedQuestionSchema = z.object({
  prompt: z.string().trim().min(8).max(300),
  options: z.array(z.string().trim().min(1).max(160)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  category: z.string().trim().min(2).max(80),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
});
const responseSchema = z.object({ questions: z.array(generatedQuestionSchema).max(MAX_BATCH_SIZE) });
type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;

function boundedNumber(raw: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

const refillThreshold = boundedNumber(process.env.QUESTION_REFILL_THRESHOLD, DEFAULT_REFILL_THRESHOLD, 10, 500);
const refillBatchSize = boundedNumber(process.env.QUESTION_REFILL_BATCH_SIZE, DEFAULT_BATCH_SIZE, 10, MAX_BATCH_SIZE);

function toDifficulty(value: GeneratedQuestion["difficulty"]): Difficulty {
  return value === "HARD" ? Difficulty.HARD : value === "MEDIUM" ? Difficulty.MEDIUM : Difficulty.EASY;
}

export class QuestionGeneratorService {
  private readonly client = env.openAiApiKey ? new OpenAI({ apiKey: env.openAiApiKey }) : null;
  private localRefillInProgress = false;

  get isAvailable(): boolean {
    return this.client !== null;
  }

  async ensureCapacity(
    allowedDifficulties: Difficulty[],
    minimumRequired = 10,
  ): Promise<number> {
    const target = Math.max(minimumRequired, refillThreshold);
    let count = await this.countEligible(allowedDifficulties);
    if (count >= target || !this.client) return count;

    const ownsLock = await this.acquireRefillLock();
    if (!ownsLock) return count;

    try {
      count = await this.countEligible(allowedDifficulties);
      if (count >= target) return count;
      const requested = Math.min(
        MAX_BATCH_SIZE,
        Math.max(refillBatchSize, target - count),
      );
      const added = await this.generateAndStore(requested, allowedDifficulties);
      logger.info("AI question bank refill completed", { countBefore: count, requested, added });
      return this.countEligible(allowedDifficulties);
    } catch (error) {
      logger.error("AI question bank refill failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return count;
    } finally {
      await this.releaseRefillLock();
    }
  }

  async generateAndStore(
    targetCount = DEFAULT_BATCH_SIZE,
    allowedDifficulties: Difficulty[] = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD],
  ): Promise<number> {
    if (!this.client) {
      logger.warn("AI question generation skipped because OPENAI_API_KEY is not configured");
      return 0;
    }

    const boundedTarget = Math.min(MAX_BATCH_SIZE, Math.max(1, Math.floor(targetCount)));
    const questions = await this.generateBatch(boundedTarget, allowedDifficulties);
    let added = 0;
    for (const question of questions) {
      if (await this.storeQuestion(question)) added += 1;
    }
    return added;
  }

  async refillIfNeeded(): Promise<void> {
    await this.ensureCapacity([Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD], 10);
  }

  private async generateBatch(count: number, allowedDifficulties: Difficulty[]): Promise<GeneratedQuestion[]> {
    const allowedNames = allowedDifficulties.map(String);
    const category = AI_CATEGORIES[Math.floor(Math.random() * AI_CATEGORIES.length)];
    const response = await this.client!.responses.create({
      model: MODEL,
      store: false,
      max_output_tokens: 12000,
      input: `Generate ${count} factually accurate, unique multiple-choice trivia questions for Quiz Royale. Focus broadly on ${category}. Allowed difficulties: ${allowedNames.join(", ")}. Use exactly four plausible options, vary the correct option position, avoid time-sensitive claims, and do not repeat common seed questions.`,
      text: {
        format: {
          type: "json_schema",
          name: "quiz_royale_questions",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["questions"],
            properties: {
              questions: {
                type: "array",
                maxItems: count,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["prompt", "options", "correctIndex", "category", "difficulty"],
                  properties: {
                    prompt: { type: "string" },
                    options: { type: "array", minItems: 4, maxItems: 4, items: { type: "string" } },
                    correctIndex: { type: "integer", minimum: 0, maximum: 3 },
                    category: { type: "string" },
                    difficulty: { type: "string", enum: allowedNames },
                  },
                },
              },
            },
          },
        },
      },
    });
    return responseSchema.parse(JSON.parse(response.output_text)).questions;
  }

  private async storeQuestion(question: GeneratedQuestion): Promise<boolean> {
    const normalizedPrompt = question.prompt.replace(/\s+/g, " ").trim();
    const existing = await prisma.questionBank.findFirst({
      where: { prompt: { equals: normalizedPrompt, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) return false;

    await prisma.questionBank.create({
      data: {
        id: generateId(),
        prompt: normalizedPrompt,
        optionA: question.options[0],
        optionB: question.options[1],
        optionC: question.options[2],
        optionD: question.options[3],
        correctIndex: question.correctIndex,
        category: question.category,
        difficulty: toDifficulty(question.difficulty),
        isActive: true,
      },
    });
    return true;
  }

  private countEligible(difficulties: Difficulty[]): Promise<number> {
    return prisma.questionBank.count({
      where: { isActive: true, difficulty: { in: difficulties } },
    });
  }

  private async acquireRefillLock(): Promise<boolean> {
    if (redisService) return redisService.setnx(REFILL_LOCK_KEY, String(Date.now()), REFILL_LOCK_SECONDS);
    if (this.localRefillInProgress) return false;
    this.localRefillInProgress = true;
    return true;
  }

  private async releaseRefillLock(): Promise<void> {
    if (redisService) {
      await redisService.del(REFILL_LOCK_KEY).catch(() => undefined);
    }
    this.localRefillInProgress = false;
  }
}

export const questionGeneratorService = new QuestionGeneratorService();
