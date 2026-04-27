/**
 * Tests for the /leaderboard router.
 *
 * Critical paths:
 *  - limit is capped at 500 (never exceeds it even if query asks for more)
 *  - GET /friends requires authentication
 */

import express from "express";
import http from "http";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    season: {
      findFirst: vi.fn(),
    },
    seasonScore: {
      findMany: vi.fn(),
    },
    xpEvent: {
      groupBy: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  };
  return { prismaMock };
});

vi.mock("../../models/prismaClient", () => ({ prisma: prismaMock }));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../services/XpService", () => ({
  levelFromTotalXp: vi.fn((xp: number) => Math.floor(xp / 1000) + 1),
}));

import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { errorHandler } from "../../middleware/errorHandler";
import leaderboardRouter from "../leaderboard";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/leaderboard", leaderboardRouter);
  app.use(errorHandler);
  return app;
}

function makeToken(sub = "user-test") {
  return jwt.sign(
    { sub, email: "t@example.com", displayName: "Tester" },
    env.jwtAccessSecret,
    { expiresIn: "1h" },
  );
}

function request(
  app: express.Express,
  method: string,
  path: string,
  options: { headers?: Record<string, string> } = {},
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      const reqOptions = {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers ?? {}),
        },
      };

      const req = http.request(reqOptions, (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          server.close();
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: data });
          }
        });
      });

      req.on("error", (err) => {
        server.close();
        reject(err);
      });

      req.end();
    });
  });
}

describe("GET /leaderboard — global", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no active season → falls back to XP-based leaderboard
    prismaMock.season.findFirst.mockResolvedValue(null);
    prismaMock.xpEvent.groupBy.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([]);
  });

  it("caps the limit at 500 when a larger value is requested", async () => {
    const app = buildApp();
    await request(app, "GET", "/leaderboard?limit=9999");

    // prisma groupBy is called in the XP fallback path
    expect(prismaMock.xpEvent.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 }),
    );
  });

  it("uses the requested limit when it is within bounds", async () => {
    const app = buildApp();
    await request(app, "GET", "/leaderboard?limit=50");

    expect(prismaMock.xpEvent.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it("defaults to limit 100 when no limit query param is provided", async () => {
    const app = buildApp();
    await request(app, "GET", "/leaderboard");

    expect(prismaMock.xpEvent.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });

  it("returns 200 and a ranked array in the XP fallback path", async () => {
    prismaMock.xpEvent.groupBy.mockResolvedValue([
      { userId: "u1", _sum: { amount: 5000 } },
      { userId: "u2", _sum: { amount: 2000 } },
    ]);
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u1", displayName: "Alice", avatarUrl: null },
      { id: "u2", displayName: "Bob", avatarUrl: null },
    ]);

    const app = buildApp();
    const res = await request(app, "GET", "/leaderboard");

    expect(res.status).toBe(200);
    const body = res.body as Array<{ rank: number; userId: string }>;
    expect(body).toHaveLength(2);
    expect(body[0].rank).toBe(1);
    expect(body[0].userId).toBe("u1");
    expect(body[1].rank).toBe(2);
  });

  it("uses season standings when an active season exists", async () => {
    prismaMock.season.findFirst.mockResolvedValue({
      id: "season-1",
      slug: "s1",
      startsAt: new Date(Date.now() - 1000),
      endsAt: new Date(Date.now() + 1000),
    });
    prismaMock.seasonScore.findMany.mockResolvedValue([
      {
        userId: "u1",
        mmr: 1800,
        wins: 10,
        gamesPlayed: 20,
        seasonId: "season-1",
        user: { id: "u1", displayName: "Alice", avatarUrl: null },
      },
    ]);

    const app = buildApp();
    const res = await request(app, "GET", "/leaderboard");

    expect(res.status).toBe(200);
    const body = res.body as Array<{ rank: number; mmr: number }>;
    expect(body).toHaveLength(1);
    expect(body[0].mmr).toBe(1800);
    // XP fallback should NOT be used
    expect(prismaMock.xpEvent.groupBy).not.toHaveBeenCalled();
  });
});

describe("GET /leaderboard/friends", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no Authorization header is provided", async () => {
    const app = buildApp();
    const res = await request(app, "GET", "/leaderboard/friends");
    expect(res.status).toBe(401);
  });

  it("returns ranked users when authenticated", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u1", displayName: "Alice", avatarUrl: null, rating: 1500 },
      { id: "u2", displayName: "Bob", avatarUrl: null, rating: 1200 },
    ]);

    const token = makeToken();
    const app = buildApp();
    const res = await request(app, "GET", "/leaderboard/friends", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as Array<{ rank: number; rating: number }>;
    expect(body).toHaveLength(2);
    expect(body[0].rank).toBe(1);
    expect(body[0].rating).toBe(1500);
  });

  it("caps friends limit at 200", async () => {
    prismaMock.user.findMany.mockResolvedValue([]);

    const token = makeToken();
    const app = buildApp();
    await request(app, "GET", "/leaderboard/friends?limit=9999", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
  });
});

describe("GET /leaderboard/season", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no Authorization header is provided", async () => {
    const app = buildApp();
    const res = await request(app, "GET", "/leaderboard/season");
    expect(res.status).toBe(401);
  });

  it("returns season null and empty rankings when no active season exists", async () => {
    prismaMock.season.findFirst.mockResolvedValue(null);

    const token = makeToken();
    const app = buildApp();
    const res = await request(app, "GET", "/leaderboard/season", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as { season: null; rankings: unknown[] };
    expect(body.season).toBeNull();
    expect(body.rankings).toEqual([]);
  });

  it("returns season info and ranked standings when an active season exists", async () => {
    const endsAt = new Date(Date.now() + 86400_000);
    prismaMock.season.findFirst.mockResolvedValue({
      id: "season-42",
      name: "Season 42",
      slug: "s42",
      startsAt: new Date(Date.now() - 1000),
      endsAt,
    });
    prismaMock.seasonScore.findMany.mockResolvedValue([
      {
        userId: "u1",
        mmr: 2000,
        wins: 15,
        gamesPlayed: 30,
        seasonId: "season-42",
        user: { id: "u1", displayName: "Alice", avatarUrl: null },
      },
      {
        userId: "u2",
        mmr: 1500,
        wins: 5,
        gamesPlayed: 20,
        seasonId: "season-42",
        user: { id: "u2", displayName: "Bob", avatarUrl: "https://example.com/bob.png" },
      },
    ]);

    const token = makeToken();
    const app = buildApp();
    const res = await request(app, "GET", "/leaderboard/season", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      season: { id: string; name: string; endsAt: string };
      rankings: Array<{ rank: number; userId: string; displayName: string; mmr: number; wins: number; gamesPlayed: number }>;
    };
    expect(body.season.id).toBe("season-42");
    expect(body.season.name).toBe("Season 42");
    expect(body.rankings).toHaveLength(2);
    expect(body.rankings[0]).toMatchObject({
      rank: 1,
      userId: "u1",
      displayName: "Alice",
      mmr: 2000,
      wins: 15,
      gamesPlayed: 30,
    });
    expect(body.rankings[1]).toMatchObject({
      rank: 2,
      userId: "u2",
      displayName: "Bob",
      mmr: 1500,
      avatarUrl: "https://example.com/bob.png",
    });
    // XP fallback should NOT be invoked
    expect(prismaMock.xpEvent.groupBy).not.toHaveBeenCalled();
  });

  it("queries seasonScore with limit 100 ordered by mmr desc", async () => {
    const endsAt = new Date(Date.now() + 3600_000);
    prismaMock.season.findFirst.mockResolvedValue({
      id: "season-99",
      name: "Season 99",
      slug: "s99",
      startsAt: new Date(Date.now() - 1000),
      endsAt,
    });
    prismaMock.seasonScore.findMany.mockResolvedValue([]);

    const token = makeToken();
    const app = buildApp();
    await request(app, "GET", "/leaderboard/season", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(prismaMock.seasonScore.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { seasonId: "season-99" },
        orderBy: { mmr: "desc" },
        take: 100,
      }),
    );
  });
});
