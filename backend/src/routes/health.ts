import { Difficulty, type PrismaClient } from "@prisma/client";
import { Router } from "express";

import { prisma } from "../models/prismaClient";
import { redisService, type RedisService } from "../services/RedisService";

export const healthRouter = Router();
type ComponentStatus = "ok" | "unhealthy";
export interface ComponentHealth {
  status: ComponentStatus;
  latencyMs?: number;
  error?: string;
  details?: Record<string, number>;
}
export interface HealthResponse {
  status: ComponentStatus;
  ts: number;
  version: string;
  buildSha: string;
  service: string;
  timestamp: string;
  components: { postgres: ComponentHealth; redis: ComponentHealth; questions: ComponentHealth };
}
interface HealthDependencies {
  prisma: Pick<PrismaClient, "$queryRawUnsafe"> & { questionBank: Pick<PrismaClient["questionBank"], "count"> };
  redis: Pick<RedisService, "ping"> | null;
  now?: () => Date;
}
const VERSION = process.env.npm_package_version ?? "1.0.0";
const BUILD_SHA = process.env.BUILD_SHA?.trim() || "unknown";
const SERVICE = "quiz-royale-backend";
const MIN_READY_QUESTIONS_PER_MODE = 11;

async function checkComponent(check: () => Promise<void>): Promise<ComponentHealth> {
  const startedAt = Date.now();
  try {
    await check();
    return { status: "ok", latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      status: "unhealthy",
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Unknown health check failure",
    };
  }
}

async function checkQuestionPools(
  questionBank: Pick<PrismaClient["questionBank"], "count">,
): Promise<ComponentHealth> {
  const startedAt = Date.now();
  try {
    const [easy, medium, hard] = await Promise.all([
      questionBank.count({ where: { isActive: true, difficulty: Difficulty.EASY } }),
      questionBank.count({
        where: { isActive: true, difficulty: { in: [Difficulty.EASY, Difficulty.MEDIUM] } },
      }),
      questionBank.count({
        where: { isActive: true, difficulty: { in: [Difficulty.MEDIUM, Difficulty.HARD] } },
      }),
    ]);
    const details = { easy, medium, hard };
    const insufficient = Object.entries(details).filter(
      ([, count]) => count < MIN_READY_QUESTIONS_PER_MODE,
    );
    if (insufficient.length > 0) {
      throw new Error(
        `Question pools below ${MIN_READY_QUESTIONS_PER_MODE}: ${insufficient
          .map(([mode, count]) => `${mode}=${count}`)
          .join(", ")}`,
      );
    }
    return { status: "ok", latencyMs: Date.now() - startedAt, details };
  } catch (error) {
    return {
      status: "unhealthy",
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Question readiness check failed",
    };
  }
}

export async function getHealth({ prisma: prismaClient, redis, now = () => new Date() }: HealthDependencies): Promise<HealthResponse> {
  const [postgres, redisHealth, questions] = await Promise.all([
    checkComponent(async () => { await prismaClient.$queryRawUnsafe("SELECT 1"); }),
    checkComponent(async () => {
      if (!redis) throw new Error("Redis service is not initialized");
      if (await redis.ping() !== "PONG") throw new Error("Unexpected Redis PING response");
    }),
    checkQuestionPools(prismaClient.questionBank),
  ]);
  const status: ComponentStatus = [postgres, redisHealth, questions].every((item) => item.status === "ok") ? "ok" : "unhealthy";
  const timestamp = now();
  return {
    status,
    ts: timestamp.getTime(),
    version: VERSION,
    buildSha: BUILD_SHA,
    service: SERVICE,
    timestamp: timestamp.toISOString(),
    components: { postgres, redis: redisHealth, questions },
  };
}

healthRouter.get("/", (_req, res) => {
  const timestamp = new Date();
  res.status(200).json({
    status: "ok",
    ts: timestamp.getTime(),
    version: VERSION,
    buildSha: BUILD_SHA,
    service: SERVICE,
    timestamp: timestamp.toISOString(),
  });
});

healthRouter.get("/ready", async (_req, res) => {
  const health = await getHealth({ prisma, redis: redisService });
  res.status(health.status === "ok" ? 200 : 503).json(health);
});
