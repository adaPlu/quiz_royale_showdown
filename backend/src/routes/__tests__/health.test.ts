import { describe, expect, it, vi } from "vitest";

import { getHealth } from "../health";

describe("getHealth", () => {
  const now = () => new Date("2026-04-25T12:00:00.000Z");

  it("reports ok when Postgres and Redis checks pass", async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ "?column?": 1 }])
    };
    const redis = {
      ping: vi.fn().mockResolvedValue("PONG")
    };

    const health = await getHealth({ prisma, redis, now });

    expect(health.status).toBe("ok");
    expect(health.ts).toBe(now().getTime());
    expect(health.version).toBeDefined();
    expect(health.components.postgres.status).toBe("ok");
    expect(health.components.redis.status).toBe("ok");
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith("SELECT 1");
    expect(redis.ping).toHaveBeenCalled();
  });

  it("reports unhealthy details when Postgres check fails", async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn().mockRejectedValue(new Error("database unavailable"))
    };
    const redis = {
      ping: vi.fn().mockResolvedValue("PONG")
    };

    const health = await getHealth({ prisma, redis, now });

    expect(health.status).toBe("unhealthy");
    expect(health.components.postgres).toMatchObject({
      status: "unhealthy",
      error: "database unavailable"
    });
    expect(health.components.redis.status).toBe("ok");
  });

  it("reports unhealthy details when Redis is not initialized", async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ "?column?": 1 }])
    };

    const health = await getHealth({ prisma, redis: null, now });

    expect(health.status).toBe("unhealthy");
    expect(health.components.postgres.status).toBe("ok");
    expect(health.components.redis).toMatchObject({
      status: "unhealthy",
      error: "Redis service is not initialized"
    });
  });
});
