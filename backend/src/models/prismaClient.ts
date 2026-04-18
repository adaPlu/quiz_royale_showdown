/**
 * Singleton Prisma Client.
 *
 * In development, reuses the instance across hot-reloads by attaching it to
 * globalThis (prevents "too many connections" during tsx watch).
 * In production, creates a single instance per process.
 */

import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";

const globalWithPrisma = globalThis as typeof globalThis & {
  __prismaClient?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? [
            { emit: "event", level: "query" },
            { emit: "event", level: "warn" },
            { emit: "event", level: "error" }
          ]
        : [
            { emit: "event", level: "warn" },
            { emit: "event", level: "error" }
          ]
  });

  if (process.env.NODE_ENV === "development") {
    // Log slow queries only (> 100 ms)
    client.$on("query", (event) => {
      if (event.duration > 100) {
        logger.warn("Slow Prisma query", {
          duration: event.duration,
          query: event.query
        });
      }
    });
  }

  client.$on("warn", (event) => {
    logger.warn("Prisma warning", { message: event.message });
  });

  client.$on("error", (event) => {
    logger.error("Prisma error", { message: event.message });
  });

  return client;
}

export const prisma: PrismaClient =
  globalWithPrisma.__prismaClient ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalWithPrisma.__prismaClient = prisma;
}

/** Call during graceful shutdown. */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
