import { randomUUID } from "node:crypto";

import { logger } from "../utils/logger";
import type { RedisService } from "./RedisService";

const SINGLE_INSTANCE_KEY = "runtime:quiz-royale:game-server";
const LEASE_TTL_SECONDS = 30;
const RENEW_INTERVAL_MS = 10_000;

export class SingleInstanceGuard {
  private readonly ownerToken = randomUUID();
  private heartbeat: NodeJS.Timeout | null = null;
  private released = false;

  constructor(private readonly redis: RedisService) {}

  async acquire(onLeaseLost: () => void): Promise<void> {
    const acquired = await this.redis.setnx(
      SINGLE_INSTANCE_KEY,
      this.ownerToken,
      LEASE_TTL_SECONDS,
    );
    if (!acquired) {
      throw new Error(
        "Another Quiz Royale game-server replica already owns the production singleton lease",
      );
    }

    this.heartbeat = setInterval(() => {
      void this.redis
        .compareAndExpire(SINGLE_INSTANCE_KEY, this.ownerToken, LEASE_TTL_SECONDS)
        .then((renewed) => {
          if (!renewed && !this.released) {
            logger.fatal("Production singleton lease was lost");
            onLeaseLost();
          }
        })
        .catch((error: unknown) => {
          logger.fatal("Production singleton lease renewal failed", {
            message: error instanceof Error ? error.message : String(error),
          });
          if (!this.released) onLeaseLost();
        });
    }, RENEW_INTERVAL_MS);
    this.heartbeat.unref();

    logger.info("Production singleton lease acquired");
  }

  async release(): Promise<void> {
    this.released = true;
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    await this.redis.compareAndDelete(SINGLE_INSTANCE_KEY, this.ownerToken);
  }
}
