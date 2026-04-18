import Redis, { type Redis as RedisClient } from "ioredis";

export class RedisService {
  private readonly client: RedisClient;

  constructor(url: string) {
    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1
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

  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.set(key, serialized, "EX", ttlSeconds);
      return;
    }

    await this.client.set(key, serialized);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }
}
