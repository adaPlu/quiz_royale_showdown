import { Router } from "express";
import type { PrismaClient } from "@prisma/client";

import { prisma } from "../models/prismaClient";
import { redisService, type RedisService } from "../services/RedisService";

export const healthRouter = Router();
type ComponentStatus = "ok" | "unhealthy";
export interface ComponentHealth { status: ComponentStatus; latencyMs?: number; error?: string; }
export interface HealthResponse {
  status: ComponentStatus;
  ts: number;
  version: string;
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
const SERVICE = "quiz-royale-backend";
const MIN_READY_QUESTIONS = 10;

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

export async function getHealth({ prisma: prismaClient, redis, now = () => new Date() }: HealthDependencies): Promise<HealthResponse> {
  const [postgres, redisHealth, questions] = await Promise.all([
    checkComponent(async () => { await prismaClient.$queryRawUnsafe("SELECT 1"); }),
    checkComponent(async () => {
      if (!redis) throw new Error("Redis service is not initialized");
      if (await redis.ping() !== "PONG") throw new Error("Unexpected Redis PING response");
    }),
    checkComponent(async () => {
      const count = await prismaClient.questionBank.count({ where: { isActive: true } });
      if (count < MIN_READY_QUESTIONS) {
        throw new Error(`Only ${count} active questions are available; ${MIN_READY_QUESTIONS} required`);
      }
    }),
  ]);
  const status: ComponentStatus = [postgres, redisHealth, questions].every((item) => item.status === "ok") ? "ok" : "unhealthy";
  const timestamp = now();
  return {
    status,
    ts: timestamp.getTime(),
    version: VERSION,
    service: SERVICE,
    timestamp: timestamp.toISOString(),
    components: { postgres, redis: redisHealth, questions },
  };
}

healthRouter.get("/", (_req, res) => {
  const timestamp = new Date();
  res.status(200).json({ status: "ok", ts: timestamp.getTime(), version: VERSION, service: SERVICE, timestamp: timestamp.toISOString() });
});

healthRouter.get("/ready", async (_req, res) => {
  const health = await getHealth({ prisma, redis: redisService });
  res.status(health.status === "ok" ? 200 : 503).json(health);
});
