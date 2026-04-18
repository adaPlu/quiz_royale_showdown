/**
 * Typed Redis wrapper for Quiz Royale backend.
 *
 * Provides a safe, typed interface over ioredis.  All methods are typed
 * generics where appropriate.  Pipeline is exposed for batched writes.
 */

import Redis, { type Redis as RedisClient, type ChainableCommander } from "ioredis";
import { logger } from "../utils/logger";

export class RedisService {
  private readonly client: RedisClient;

  constructor(url: string) {
    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 10) return null; // stop retrying
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

  // ─── Lifecycle ──────────────────────────────────────────────────────────

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

  // ─── String ─────────────────────────────────────────────────────────────

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

  /** SET only if key does Not eXist.  Returns true if the key was set. */
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

  // ─── JSON helpers ────────────────────────────────────────────────────────

  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  // ─── Hash ────────────────────────────────────────────────────────────────

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.client.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.client.hdel(key, ...fields);
  }

  async hmset(key: string, data: Record<string, string>): Promise<void> {
    await this.client.hset(key, data);
  }

  // ─── Set ─────────────────────────────────────────────────────────────────

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

  // ─── Sorted Set ──────────────────────────────────────────────────────────

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
    return result;
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

  // ─── Pub/Sub ─────────────────────────────────────────────────────────────

  async publish(channel: string, message: string): Promise<number> {
    return this.client.publish(channel, message);
  }

  /**
   * Returns a NEW ioredis client subscribed to the given channel.
   * Caller is responsible for calling `.disconnect()` on the returned client.
   */
  createSubscriber(): RedisClient {
    return this.client.duplicate();
  }

  // ─── Pipeline ────────────────────────────────────────────────────────────

  pipeline(): ChainableCommander {
    return this.client.pipeline();
  }

  // ─── Lua Scripting ───────────────────────────────────────────────────────

  /**
   * Atomically set a key only if the given expected value matches.
   * Returns true if the swap happened.
   */
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
}

/** Singleton Redis service instance. */
export let redisService: RedisService | null = null;

export function initRedis(url: string): RedisService {
  redisService = new RedisService(url);
  return redisService;
}
