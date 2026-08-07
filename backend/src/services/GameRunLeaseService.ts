import { randomUUID } from "node:crypto";

import { ConflictError } from "../utils/errors";
import { logger } from "../utils/logger";
import { redisService } from "./RedisService";

const GAME_RUN_LEASE_SECONDS = 10 * 60;
const localActiveRooms = new Set<string>();

function leaseKey(roomId: string): string {
  return `game:${roomId}:runner-lease`;
}

export class GameRunLeaseService {
  async acquire(roomId: string): Promise<string> {
    const token = randomUUID();

    if (!redisService) {
      if (localActiveRooms.has(roomId)) {
        throw new ConflictError("A game loop is already active for this room");
      }
      localActiveRooms.add(roomId);
      return token;
    }

    const acquired = await redisService.setnx(
      leaseKey(roomId),
      token,
      GAME_RUN_LEASE_SECONDS,
    );
    if (!acquired) {
      throw new ConflictError("A game loop is already active for this room");
    }

    logger.info("Per-room game runner lease acquired", { roomId });
    return token;
  }

  async release(roomId: string, token: string): Promise<void> {
    if (!redisService) {
      localActiveRooms.delete(roomId);
      return;
    }

    const released = await redisService.compareAndDelete(leaseKey(roomId), token);
    if (!released) {
      logger.warn("Per-room game runner lease was not owned during release", { roomId });
    }
  }

  async isActive(roomId: string): Promise<boolean> {
    if (!redisService) return localActiveRooms.has(roomId);
    return (await redisService.exists(leaseKey(roomId))) > 0;
  }
}

export const gameRunLeaseService = new GameRunLeaseService();
