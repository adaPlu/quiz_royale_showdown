/**
 * Tests for the /friends router.
 *
 * Critical paths:
 *  - POST /friends/request requires auth (returns 401 without a token)
 *  - POST /friends/request creates a friendship record (201)
 *  - POST /friends/request returns 409 when friendship already exists
 *  - GET /friends returns accepted friends list
 */

import express from "express";
import http from "http";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    friendship: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    xpEvent: {
      groupBy: vi.fn(),
    },
  };
  return { prismaMock };
});

vi.mock("../../models/prismaClient", () => ({ prisma: prismaMock }));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../services/XpService", () => ({
  levelFromTotalXp: vi.fn((xp: number) => (xp >= 600 ? 2 : 1)),
}));

import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { errorHandler } from "../../middleware/errorHandler";
import friendsRouter from "../friends";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/friends", friendsRouter);
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
  options: { headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      const bodyStr = options.body ? JSON.stringify(options.body) : undefined;
      const reqOptions = {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr).toString() } : {}),
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

      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  });
}

describe("POST /friends/request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no Authorization header is provided", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/friends/request", {
      body: { addresseeId: "other-user" },
    });
    expect(res.status).toBe(401);
  });

  it("creates a friendship and returns 201", async () => {
    const fakeFriendship = {
      id: "01FRIENDSHIP001",
      requesterId: "user-test",
      addresseeId: "other-user",
      status: "PENDING",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    prismaMock.friendship.findFirst.mockResolvedValue(null);
    prismaMock.friendship.create.mockResolvedValue(fakeFriendship);

    const token = makeToken("user-test");
    const app = buildApp();
    const res = await request(app, "POST", "/friends/request", {
      headers: { Authorization: `Bearer ${token}` },
      body: { addresseeId: "other-user" },
    });

    expect(res.status).toBe(201);
    expect((res.body as { status: string }).status).toBe("PENDING");
  });

  it("returns 409 when a friendship already exists", async () => {
    prismaMock.friendship.findFirst.mockResolvedValue({
      id: "existing",
      requesterId: "user-test",
      addresseeId: "other-user",
      status: "PENDING",
    });

    const token = makeToken("user-test");
    const app = buildApp();
    const res = await request(app, "POST", "/friends/request", {
      headers: { Authorization: `Bearer ${token}` },
      body: { addresseeId: "other-user" },
    });

    expect(res.status).toBe(409);
  });

  it("returns 400 when trying to friend yourself", async () => {
    const token = makeToken("user-test");
    const app = buildApp();
    const res = await request(app, "POST", "/friends/request", {
      headers: { Authorization: `Bearer ${token}` },
      body: { addresseeId: "user-test" },
    });

    expect(res.status).toBe(400);
  });
});

describe("GET /friends", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const app = buildApp();
    const res = await request(app, "GET", "/friends");
    expect(res.status).toBe(401);
  });

  it("returns accepted friends list", async () => {
    prismaMock.friendship.findMany.mockResolvedValue([
      {
        id: "fs1",
        requesterId: "user-test",
        addresseeId: "friend-user",
        status: "ACCEPTED",
        requester: { id: "user-test", displayName: "Tester", avatarUrl: null },
        addressee: { id: "friend-user", displayName: "Friend", avatarUrl: null },
      },
    ]);

    const token = makeToken("user-test");
    const app = buildApp();
    const res = await request(app, "GET", "/friends", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as { friends: Array<{ displayName: string }> };
    expect(body.friends).toHaveLength(1);
    expect(body.friends[0].displayName).toBe("Friend");
  });
});

describe("PUT /friends/:id/accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const app = buildApp();
    const res = await request(app, "PUT", "/friends/fs1/accept");
    expect(res.status).toBe(401);
  });

  it("returns 404 when friendship not found", async () => {
    prismaMock.friendship.findFirst.mockResolvedValue(null);

    const token = makeToken("user-test");
    const app = buildApp();
    const res = await request(app, "PUT", "/friends/nonexistent/accept", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
  });

  it("accepts a pending request and returns 200", async () => {
    const fakeFriendship = {
      id: "fs1",
      requesterId: "other-user",
      addresseeId: "user-test",
      status: "PENDING",
    };
    const updatedFriendship = { ...fakeFriendship, status: "ACCEPTED" };

    prismaMock.friendship.findFirst.mockResolvedValue(fakeFriendship);
    prismaMock.friendship.update.mockResolvedValue(updatedFriendship);

    const token = makeToken("user-test");
    const app = buildApp();
    const res = await request(app, "PUT", "/friends/fs1/accept", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe("ACCEPTED");
  });
});

describe("GET /friends/pending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const app = buildApp();
    const res = await request(app, "GET", "/friends/pending");
    expect(res.status).toBe(401);
  });

  it("returns pending incoming friend requests for the addressee", async () => {
    prismaMock.friendship.findMany.mockResolvedValue([
      {
        id: "fs-pending-1",
        requesterId: "requester-user",
        addresseeId: "user-test",
        status: "PENDING",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        requester: { id: "requester-user", displayName: "Requester", avatarUrl: null },
      },
    ]);

    const token = makeToken("user-test");
    const app = buildApp();
    const res = await request(app, "GET", "/friends/pending", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as { pending: Array<{ friendshipId: string; requester: { displayName: string } }> };
    expect(body.pending).toHaveLength(1);
    expect(body.pending[0].friendshipId).toBe("fs-pending-1");
    expect(body.pending[0].requester.displayName).toBe("Requester");
  });
});

describe("DELETE /friends/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const app = buildApp();
    const res = await request(app, "DELETE", "/friends/fs1");
    expect(res.status).toBe(401);
  });

  it("returns 404 when friendship not found", async () => {
    prismaMock.friendship.findFirst.mockResolvedValue(null);

    const token = makeToken("user-test");
    const app = buildApp();
    const res = await request(app, "DELETE", "/friends/nonexistent", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
  });

  it("deletes a friendship and returns 204", async () => {
    const fakeFriendship = {
      id: "fs1",
      requesterId: "user-test",
      addresseeId: "other-user",
      status: "ACCEPTED",
    };

    prismaMock.friendship.findFirst.mockResolvedValue(fakeFriendship);
    prismaMock.friendship.delete.mockResolvedValue(fakeFriendship);

    const token = makeToken("user-test");
    const app = buildApp();
    const res = await request(app, "DELETE", "/friends/fs1", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(204);
  });
});

describe("GET /friends/leaderboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const app = buildApp();
    const res = await request(app, "GET", "/friends/leaderboard");
    expect(res.status).toBe(401);
  });

  it("returns a sorted leaderboard with rank field when user has friends", async () => {
    // user-test has one accepted friend: friend-a
    prismaMock.friendship.findMany.mockResolvedValue([
      {
        id: "fs-lb-1",
        requesterId: "user-test",
        addresseeId: "friend-a",
        status: "ACCEPTED",
      },
    ]);
    prismaMock.user.findMany.mockResolvedValue([
      { id: "user-test", displayName: "Me", avatarUrl: null },
      { id: "friend-a", displayName: "Friend A", avatarUrl: null },
    ]);
    prismaMock.xpEvent.groupBy.mockResolvedValue([
      { userId: "user-test", _sum: { amount: 200 } },
      { userId: "friend-a", _sum: { amount: 800 } },
    ]);

    const token = makeToken("user-test");
    const app = buildApp();
    const res = await request(app, "GET", "/friends/leaderboard", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      leaderboard: Array<{ rank: number; id: string; totalXp: number }>;
    };
    expect(body.leaderboard).toHaveLength(2);
    // friend-a has more XP so should be rank 1
    expect(body.leaderboard[0].rank).toBe(1);
    expect(body.leaderboard[0].id).toBe("friend-a");
    expect(body.leaderboard[1].rank).toBe(2);
    expect(body.leaderboard[1].id).toBe("user-test");
  });

  it("self is always included even with no friends", async () => {
    prismaMock.friendship.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([
      { id: "user-test", displayName: "Me", avatarUrl: null },
    ]);
    prismaMock.xpEvent.groupBy.mockResolvedValue([
      { userId: "user-test", _sum: { amount: 100 } },
    ]);

    const token = makeToken("user-test");
    const app = buildApp();
    const res = await request(app, "GET", "/friends/leaderboard", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      leaderboard: Array<{ rank: number; id: string }>;
    };
    expect(body.leaderboard).toHaveLength(1);
    expect(body.leaderboard[0].id).toBe("user-test");
    expect(body.leaderboard[0].rank).toBe(1);
  });

  it("returns rank 1 with totalXp 0 when user has no friends and no XP", async () => {
    prismaMock.friendship.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([
      { id: "user-test", displayName: "Me", avatarUrl: null },
    ]);
    // No XP events for this user
    prismaMock.xpEvent.groupBy.mockResolvedValue([]);

    const token = makeToken("user-test");
    const app = buildApp();
    const res = await request(app, "GET", "/friends/leaderboard", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      leaderboard: Array<{ rank: number; totalXp: number }>;
    };
    expect(body.leaderboard).toHaveLength(1);
    expect(body.leaderboard[0].rank).toBe(1);
    expect(body.leaderboard[0].totalXp).toBe(0);
  });
});
