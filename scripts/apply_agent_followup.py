from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    content = target.read_text(encoding="utf-8")
    if old not in content:
        raise RuntimeError(f"Expected text not found in {path}: {old!r}")
    target.write_text(content.replace(old, new, 1), encoding="utf-8")

replace_once(
    "backend/src/services/RoomService.ts",
    "      isPrivate: false,\n      maxPlayers: DEFAULT_ROOM_CONFIG.maxPlayers,\n    });",
    "      isPrivate: false,\n      maxPlayers: DEFAULT_ROOM_CONFIG.maxPlayers,\n      autoStartSolo: false,\n    });",
)

health_test = '''import { describe, expect, it, vi } from "vitest";

import { getHealth } from "../health";

describe("getHealth", () => {
  const now = () => new Date("2026-04-25T12:00:00.000Z");
  const questionBank = { count: vi.fn().mockResolvedValue(60) };

  it("reports ok when Postgres, Redis, and question checks pass", async () => {
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
    expect(health.components.questions.status).toBe("ok");
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

  it("reports unhealthy when fewer than ten active questions exist", async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
      questionBank: { count: vi.fn().mockResolvedValue(9) }
    };
    const health = await getHealth({ prisma, redis: { ping: vi.fn().mockResolvedValue("PONG") }, now });
    expect(health.status).toBe("unhealthy");
    expect(health.components.questions.error).toContain("10 required");
  });
});
'''
(ROOT / "backend/src/routes/__tests__/health.test.ts").write_text(health_test, encoding="utf-8")
print("Applied compile follow-up fixes.")
