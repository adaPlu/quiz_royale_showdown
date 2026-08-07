/**
 * Quiz Royale Showdown — Backend entrypoint.
 *
 * Production startup is fail-closed for Redis. Individual game loops are
 * protected by per-room distributed leases, allowing safe rolling deploys
 * without permitting duplicate runners for the same room.
 */

import http from "http";
import { Server } from "socket.io";

import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./models/prismaClient";
import { initRedis } from "./services/RedisService";
import { initSocketServer } from "./socket";
import { logger } from "./utils/logger";

async function bootstrap(): Promise<void> {
  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: env.corsOrigins,
      credentials: true
    },
    path: "/ws",
    pingTimeout: 60_000,
    pingInterval: 25_000
  });
  initSocketServer(io);

  const redis = initRedis(env.redisUrl);
  let shuttingDown = false;

  const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal} — shutting down gracefully`);

    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      logger.info("HTTP server closed");
    }

    await new Promise<void>((resolve) => io.close(() => resolve()));
    logger.info("Socket.IO server closed");

    await redis.disconnect().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    logger.info("Graceful shutdown complete");
    process.exit(exitCode);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("uncaughtException", (error) => {
    logger.fatal("Uncaught exception", { message: error.message, stack: error.stack });
    void shutdown("uncaughtException", 1);
  });
  process.on("unhandledRejection", (reason) => {
    logger.fatal("Unhandled rejection", {
      reason: reason instanceof Error ? reason.message : String(reason)
    });
    void shutdown("unhandledRejection", 1);
  });

  await redis.connect();
  logger.info("Redis connected");

  await new Promise<void>((resolve) => {
    server.listen(env.port, "0.0.0.0", resolve);
  });

  logger.info("Quiz Royale backend started", {
    host: "0.0.0.0",
    port: env.port,
    env: env.nodeEnv,
    wsPath: "/ws",
    buildSha: process.env.BUILD_SHA ?? "unknown",
    gameOwnership: "per-room-redis-lease",
  });
}

bootstrap().catch((error: unknown) => {
  console.error("Bootstrap failed:", error);
  process.exit(1);
});
