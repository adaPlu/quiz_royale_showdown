/**
 * Quiz Royale Showdown — Backend entrypoint.
 *
 * Bootstrap order:
 *  1. Validate environment (env.ts exits on bad config)
 *  2. Create Express app
 *  3. Attach Socket.IO server
 *  4. Listen on Railway's injected port
 *  5. Connect Redis without blocking HTTP liveness
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

  // 3. Create the Redis client before routes begin handling requests. The actual
  // connection is attempted after HTTP starts so Railway can observe liveness
  // even while a dependency is starting or temporarily unavailable.
  const redis = initRedis(env.redisUrl);

  // 4. HTTP server. Railway routes traffic to the injected PORT on 0.0.0.0.
  await new Promise<void>((resolve) => {
    server.listen(env.port, "0.0.0.0", resolve);
  });

  logger.info("Quiz Royale backend started", {
    host: "0.0.0.0",
    port: env.port,
    env: env.nodeEnv,
    wsPath: "/ws"
  });

  // 5. Redis readiness is reported by /health/ready. Do not terminate the HTTP
  // process on the first connection failure; Railway services have no depends_on
  // ordering guarantee and Redis may become ready shortly after this container.
  void redis
    .connect()
    .then(() => {
      logger.info("Redis connected", { url: env.redisUrl });
    })
    .catch((error: unknown) => {
      logger.error("Redis connection failed — service remains live but not ready", {
        message: error instanceof Error ? error.message : String(error)
      });
    });

  // ─── Graceful shutdown ────────────────────────────────────────────────────

  const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
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
}

bootstrap().catch((error: unknown) => {
  console.error("Bootstrap failed:", error);
  process.exit(1);
});
