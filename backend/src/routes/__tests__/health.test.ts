import { describe, expect, it, vi } from "vitest";

import { getHealth } from "../health";

describe("getHealth", () => {
  const now = () => new Date("2026-04-25T12:00:00.000Z");
  const questionBank = { count: vi.fn().mockResolvedValue(60) };

  it("reports ok when Postgres, Redis, and every question pool pass", async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
      questionBank
    };
    const redis = { ping: vi.fn().mockResolvedValue("PONG") };

    const health = await getHealth({ prisma, redis, now });

    expect(health.status).toBe("ok");
    expect(health.ts).toBe(now().getTime());
    expect(health.components.postgres.status).toBe("ok");
    expect(health.components.redis.status).toBe("ok");
    expect(health.components.questions).toMatchObject({
      status: "ok",
      details: { easy: 60, medium: 60, hard: 60 },
    });
  });

  it("reports unhealthy details when Postgres check fails", async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn().mockRejectedValue(new Error("database unavailable")),
      questionBank
    };
    const health = await getHealth({ prisma, redis: { ping: vi.fn().mockResolvedValue("PONG") }, now });
    expect(health.status).toBe("unhealthy");
    expect(health.components.postgres).toMatchObject({ status: "unhealthy", error: "database unavailable" });
    expect(health.components.questions.status).toBe("ok");
  });

  it("reports unhealthy details when Redis is not initialized", async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
      questionBank
    };
    const health = await getHealth({ prisma, redis: null, now });
    expect(health.status).toBe("unhealthy");
    expect(health.components.redis).toMatchObject({ status: "unhealthy", error: "Redis service is not initialized" });
  });

  it("reports unhealthy when any difficulty pool has fewer than eleven questions", async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
      questionBank: { count: vi.fn().mockResolvedValue(10) }
    };
    const health = await getHealth({ prisma, redis: { ping: vi.fn().mockResolvedValue("PONG") }, now });
    expect(health.status).toBe("unhealthy");
    expect(health.components.questions.error).toContain("below 11");
  });
});
