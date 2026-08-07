/**
 * Typed Redis wrapper for Quiz Royale backend.
 *
 * Redis is a low-latency cache for active gameplay. Authoritative answers and
 * room scores live in PostgreSQL; score and answer reads rebuild missing cache
 * entries so a Redis restart does not change a match result.
 */

import Redis, { type Redis as RedisClient, type ChainableCommander } from "ioredis";

import { prisma } from "../models/prismaClient";
import { logger } from "../utils/logger";

const DEFAULT_TIME_LIMIT_MS = 20_000;

function calculatePersistedScore(isCorrect: boolean, answerTimeMs: number): number {
  if (!isCorrect) return 0;
  return Math.max(0, 1000 - Math.floor((answerTimeMs / DEFAULT_TIME_LIMIT_MS) * 400));
}

export class RedisService {
  private readonly client: RedisClient;

  constructor(url: string) {
    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 10) return null;
        return Math.min(times * 200, 3000);
      }
    });

    this.client.on("error", (err: Error) => {
      logger.error("Redis error", { message: err.message });
    });

    this.client.on("reconnecting", () => {
      logger.warn("Redis reconnecting…");
    });

    this.client.on("ready", () => {
      logger.info("Redis ready");
    });
  }

  async connect(): Promise<void> {
    if (this.client.status === "wait") {
      await this.client.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.client.status === "ready") {
      await this.client.quit();
    }
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, "EX", ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async setnx(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (ttlSeconds) {
      const result = await this.client.set(key, value, "EX", ttlSeconds, "NX");
      return result === "OK";
    }
    const result = await this.client.setnx(key, value);
    return result === 1;
  }

  async del(...keys: string[]): Promise<number> {
    return this.client.del(...keys);
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.expire(key, ttlSeconds);
    return result === 1;
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async exists(...keys: string[]): Promise<number> {
    return this.client.exists(...keys);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async incrBy(key: string, increment: number): Promise<number> {
    return this.client.incrby(key, increment);
  }

  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.client.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const cached = await this.client.hgetall(key);
    if (Object.keys(cached).length > 0) return cached;

    const match = /^room:([^:]+):round:([^:]+):answers$/.exec(key);
    if (!match) return cached;

    const [, roomId, roundId] = match;
    const answers = await prisma.answer.findMany({
      where: { roundId, round: { roomId } },
      select: {
        userId: true,
        answerIndex: true,
        isCorrect: true,
        answerTimeMs: true,
        submittedAt: true,
      },
    });
    if (answers.length === 0) return cached;

    const rebuilt = Object.fromEntries(
      answers.map((answer) => [
        answer.userId,
        JSON.stringify({
          answerIndex: answer.answerIndex,
          clientSentAt: answer.submittedAt.toISOString(),
          isCorrect: answer.isCorrect,
          scoreDelta: calculatePersistedScore(answer.isCorrect, answer.answerTimeMs),
          submittedAt: answer.submittedAt.toISOString(),
        }),
      ]),
    );
    await this.client.hset(key, rebuilt);
    await this.client.expire(key, 7200);
    logger.warn("Rebuilt missing round-answer cache from PostgreSQL", {
      roomId,
      roundId,
      answerCount: answers.length,
    });
    return rebuilt;
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.client.hdel(key, ...fields);
  }

  async hmset(key: string, data: Record<string, string>): Promise<void> {
    await this.client.hset(key, data);
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.client.sadd(key, ...members);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return this.client.srem(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  async sismember(key: string, member: string): Promise<boolean> {
    const result = await this.client.sismember(key, member);
    return result === 1;
  }

  async scard(key: string): Promise<number> {
    return this.client.scard(key);
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    return this.client.zadd(key, score, member);
  }

  async zincrby(key: string, increment: number, member: string): Promise<string> {
    return this.client.zincrby(key, increment, member);
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.zrevrange(key, start, stop);
  }

  async zrevrangeWithScores(
    key: string,
    start: number,
    stop: number
  ): Promise<Array<{ member: string; score: number }>> {
    const raw = await this.client.zrevrange(key, start, stop, "WITHSCORES");
    const result: Array<{ member: string; score: number }> = [];
    for (let i = 0; i < raw.length; i += 2) {
      result.push({ member: raw[i], score: parseFloat(raw[i + 1]) });
    }
    if (result.length > 0) return result;

    const match = /^room:([^:]+):scores$/.exec(key);
    if (!match) return result;

    const roomId = match[1];
    const persisted = await prisma.roomPlayer.findMany({
      where: { roomId },
      orderBy: [{ score: "desc" }, { userId: "asc" }],
      select: { userId: true, score: true },
    });
    if (persisted.length === 0) return result;

    const pipeline = this.client.pipeline();
    for (const row of persisted) pipeline.zadd(key, row.score, row.userId);
    pipeline.expire(key, 7200);
    await pipeline.exec();

    const lastIndex = stop < 0 ? persisted.length : stop + 1;
    logger.warn("Rebuilt missing room-score cache from PostgreSQL", {
      roomId,
      playerCount: persisted.length,
    });
    return persisted.slice(start, lastIndex).map((row) => ({
      member: row.userId,
      score: row.score,
    }));
  }

  async zrank(key: string, member: string): Promise<number | null> {
    return this.client.zrank(key, member);
  }

  async zrevrank(key: string, member: string): Promise<number | null> {
    return this.client.zrevrank(key, member);
  }

  async zscore(key: string, member: string): Promise<string | null> {
    return this.client.zscore(key, member);
  }

  async zcard(key: string): Promise<number> {
    return this.client.zcard(key);
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    return this.client.zrem(key, ...members);
  }

  async publish(channel: string, message: string): Promise<number> {
    return this.client.publish(channel, message);
  }

  createSubscriber(): RedisClient {
    return this.client.duplicate();
  }

  pipeline(): ChainableCommander {
    return this.client.pipeline();
  }

  async compareAndSet(key: string, expected: string, next: string): Promise<boolean> {
    const script = `
      local current = redis.call("GET", KEYS[1])
      if current == ARGV[1] then
        redis.call("SET", KEYS[1], ARGV[2])
        return 1
      else
        return 0
      end
    `;
    const result = await this.client.eval(script, 1, key, expected, next);
    return result === 1;
  }

  async compareAndExpire(key: string, expected: string, ttlSeconds: number): Promise<boolean> {
    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("EXPIRE", KEYS[1], ARGV[2])
      end
      return 0
    `;
    const result = await this.client.eval(script, 1, key, expected, String(ttlSeconds));
    return result === 1;
  }

  async compareAndDelete(key: string, expected: string): Promise<boolean> {
    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      end
      return 0
    `;
    const result = await this.client.eval(script, 1, key, expected);
    return result === 1;
  }
}

export let redisService: RedisService | null = null;

export function initRedis(url: string): RedisService {
  redisService = new RedisService(url);
  return redisService;
}
