import { randomUUID } from "node:crypto";

import OpenAI from "openai";
import { Difficulty } from "@prisma/client";
import { z } from "zod";

import { env } from "../config/env";
import { prisma } from "../models/prismaClient";
import { logger } from "../utils/logger";
import { generateId } from "../utils/ulid";
import { redisService } from "./RedisService";

const MAX_BATCH_SIZE = 60;
const REFILL_LOCK_SECONDS = 300;
const REFILL_LOCK_KEY = "questions:ai-refill-lock";
const MODEL = env.openAiQuestionModel;
const refillThreshold = env.questionRefillThreshold;
const refillBatchSize = env.questionRefillBatchSize;
const dailyGenerationLimit = env.questionDailyGenerationLimit;

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

function toDifficulty(value: GeneratedQuestion["difficulty"]): Difficulty {
  return value === "HARD" ? Difficulty.HARD : value === "MEDIUM" ? Difficulty.MEDIUM : Difficulty.EASY;
}

function dailyBudgetKey(now = new Date()): string {
  return `questions:ai-generated:${now.toISOString().slice(0, 10)}`;
}

export class QuestionGeneratorService {
  private readonly client = env.openAiApiKey
    ? new OpenAI({
        apiKey: env.openAiApiKey,
        timeout: 45_000,
        maxRetries: 2,
      })
    : null;
  private localRefillToken: string | null = null;
  private localDailyGenerated = 0;

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

    const lockToken = await this.acquireRefillLock();
    if (!lockToken) return count;

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
      await this.releaseRefillLock(lockToken);
    }
  }

  async generateAndStore(
    targetCount = refillBatchSize,
    allowedDifficulties: Difficulty[] = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD],
  ): Promise<number> {
    if (!this.client) {
      logger.warn("AI question generation skipped because OPENAI_API_KEY is not configured");
      return 0;
    }

    const boundedTarget = Math.min(MAX_BATCH_SIZE, Math.max(1, Math.floor(targetCount)));
    const allowedCount = await this.reserveDailyBudget(boundedTarget);
    if (allowedCount <= 0) {
      logger.warn("AI question generation skipped because the daily question budget is exhausted", {
        dailyGenerationLimit,
      });
      return 0;
    }

    const questions = await this.generateBatch(allowedCount, allowedDifficulties);
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

  private async reserveDailyBudget(requested: number): Promise<number> {
    if (!redisService) {
      const remaining = Math.max(0, dailyGenerationLimit - this.localDailyGenerated);
      const reserved = Math.min(requested, remaining);
      this.localDailyGenerated += reserved;
      return reserved;
    }

    const key = dailyBudgetKey();
    const total = await redisService.incrBy(key, requested);
    await redisService.expire(key, 2 * 24 * 60 * 60);
    if (total <= dailyGenerationLimit) return requested;

    const overflow = total - dailyGenerationLimit;
    return Math.max(0, requested - overflow);
  }

  private async acquireRefillLock(): Promise<string | null> {
    const token = randomUUID();
    if (redisService) {
      const acquired = await redisService.setnx(REFILL_LOCK_KEY, token, REFILL_LOCK_SECONDS);
      return acquired ? token : null;
    }
    if (this.localRefillToken) return null;
    this.localRefillToken = token;
    return token;
  }

  private async releaseRefillLock(token: string): Promise<void> {
    if (redisService) {
      await redisService.compareAndDelete(REFILL_LOCK_KEY, token).catch(() => undefined);
    }
    if (this.localRefillToken === token) this.localRefillToken = null;
  }
}

export const questionGeneratorService = new QuestionGeneratorService();
