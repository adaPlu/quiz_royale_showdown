/**
 * Quiz Royale Showdown — Backend entrypoint.
 *
 * Bootstrap order:
 *  1. Validate environment (env.ts exits on bad config)
 *  2. Create Express app
 *  3. Attach Socket.IO server
 *  4. Connect Redis (fail-open in development, fail-closed in production)
 *  5. Listen
 *  6. Register graceful shutdown handlers
 */

import http from "http";
import { Server } from "socket.io";

import { createApp } from "./app";
import { env } from "./config/env";
import { initRedis } from "./services/RedisService";
import { initSocketServer } from "./socket";
import { logger } from "./utils/logger";

// ─── Boot ────────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  // 1. Express
  const app = createApp();
  const server = http.createServer(app);

  // 2. Socket.IO
  const io = new Server(server, {
    cors: {
      origin: env.corsOrigin,
      credentials: true
    },
    path: "/ws",
    pingTimeout: 60_000,
    pingInterval: 25_000
  });

  initSocketServer(io);

  // 3. Redis
  const redis = initRedis(env.redisUrl);
  try {
    await redis.connect();
    logger.info("Redis connected", { url: env.redisUrl });
  } catch (error) {
    if (env.isProduction) {
      logger.fatal("Redis connection failed — aborting", {
        message: error instanceof Error ? error.message : String(error)
      });
      process.exit(1);
    } else {
      logger.warn("Redis unavailable — continuing without cache (dev only)", {
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // 4. HTTP server
  await new Promise<void>((resolve) => {
    server.listen(env.port, resolve);
  });

  logger.info("Quiz Royale backend started", {
    port: env.port,
    env: env.nodeEnv,
    wsPath: "/ws"
  });

  // ─── Graceful shutdown ────────────────────────────────────────────────────

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal} — shutting down gracefully`);

    // Stop accepting new HTTP connections
    server.close(() => {
      logger.info("HTTP server closed");
    });

    // Close Socket.IO connections
    io.close(() => {
      logger.info("Socket.IO server closed");
    });

    // Close Redis
    await redis.disconnect();
    logger.info("Redis disconnected");

    logger.info("Graceful shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  process.on("uncaughtException", (error) => {
    logger.fatal("Uncaught exception", { message: error.message, stack: error.stack });
    void shutdown("uncaughtException").then(() => process.exit(1));
  });

  process.on("unhandledRejection", (reason) => {
    logger.fatal("Unhandled rejection", {
      reason: reason instanceof Error ? reason.message : String(reason)
    });
  });
}

bootstrap().catch((error: unknown) => {
  console.error("Bootstrap failed:", error);
  process.exit(1);
});
