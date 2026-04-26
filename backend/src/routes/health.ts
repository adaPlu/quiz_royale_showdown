import { Router } from "express";
import type { PrismaClient } from "@prisma/client";

import { prisma } from "../models/prismaClient";
import { redisService, type RedisService } from "../services/RedisService";

export const healthRouter = Router();

type ComponentStatus = "ok" | "unhealthy";
type HealthStatus = "ok" | "unhealthy";

export interface ComponentHealth {
  status: ComponentStatus;
  latencyMs?: number;
  error?: string;
}

export interface HealthResponse {
  status: HealthStatus;
  ts: number;
  version: string;
  service: string;
  timestamp: string;
  components: {
    postgres: ComponentHealth;
    redis: ComponentHealth;
  };
}

interface HealthDependencies {
  prisma: Pick<PrismaClient, "$queryRawUnsafe">;
  redis: Pick<RedisService, "ping"> | null;
  now?: () => Date;
}

const VERSION = process.env.npm_package_version ?? "1.0.0";

async function checkComponent(check: () => Promise<void>): Promise<ComponentHealth> {
  const startedAt = Date.now();

  try {
    await check();
    return {
      status: "ok",
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown health check failure";
    return {
      status: "unhealthy",
      latencyMs: Date.now() - startedAt,
      error: message
    };
  }
}

export async function getHealth({
  prisma: prismaClient,
  redis,
  now = () => new Date()
}: HealthDependencies): Promise<HealthResponse> {
  const [postgres, redisHealth] = await Promise.all([
    checkComponent(async () => {
      await prismaClient.$queryRawUnsafe("SELECT 1");
    }),
    checkComponent(async () => {
      if (!redis) {
        throw new Error("Redis service is not initialized");
      }
      const pong = await redis.ping();
      if (pong !== "PONG") {
        throw new Error(`Unexpected Redis PING response: ${pong}`);
      }
    })
  ]);

  const status: HealthStatus =
    postgres.status === "ok" && redisHealth.status === "ok" ? "ok" : "unhealthy";
  const timestamp = now();

  return {
    status,
    ts: timestamp.getTime(),
    version: VERSION,
    service: "quiz-royale-backend",
    timestamp: timestamp.toISOString(),
    components: {
      postgres,
      redis: redisHealth
    }
  };
}

healthRouter.get("/", async (_req, res) => {
  const health = await getHealth({
    prisma,
    redis: redisService
  });

  res.status(health.status === "ok" ? 200 : 503).json(health);
});
