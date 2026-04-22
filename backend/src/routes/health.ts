import { Router } from "express";
import { prisma } from "../models/prismaClient";
import { redisService } from "../services/RedisService";
import { logger } from "../utils/logger";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const checks: Record<string, "ok" | "error"> = {};

  // DB ping
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch (err) {
    logger.warn("Health check: DB unreachable", { err });
    checks.database = "error";
  }

  // Redis ping
  try {
    if (redisService) {
      await redisService.set("health:ping", "1", 10);
      checks.redis = "ok";
    } else {
      checks.redis = "error";
    }
  } catch (err) {
    logger.warn("Health check: Redis unreachable", { err });
    checks.redis = "error";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");
  res.status(allOk ? 200 : 503).json({
    status: allOk ? "ok" : "degraded",
    checks,
    version: "1.0.0",
    service: "quiz-royale-backend",
    ts: Date.now(),
  });
});
