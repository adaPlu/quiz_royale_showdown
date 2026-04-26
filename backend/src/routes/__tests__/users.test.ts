/**
 * Tests for the /users router.
 *
 * Critical paths:
 *  - GET /me requires auth (returns 401 without a token)
 *  - GET /search returns at most 20 results
 *  - GET /:displayName/profile returns 404 for unknown users
 */

import express from "express";
import http from "http";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  };
  return { prismaMock };
});

vi.mock("../../models/prismaClient", () => ({ prisma: prismaMock }));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// We keep requireAuth as-is — it reads from env.jwtAccessSecret
// We'll generate a real JWT in tests for auth endpoints.
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { errorHandler } from "../../middleware/errorHandler";
import usersRouter from "../users";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/users", usersRouter);
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

describe("GET /users/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no Authorization header is provided", async () => {
    const app = buildApp();
    const res = await request(app, "GET", "/users/me");
    expect(res.status).toBe(401);
  });

  it("returns the current user when a valid JWT is provided", async () => {
    const fakeUser = {
      id: "user-test",
      email: "t@example.com",
      displayName: "Tester",
      avatarUrl: null,
      rating: 1000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    prismaMock.user.findUnique.mockResolvedValue(fakeUser);

    const token = makeToken("user-test");
    const app = buildApp();
    const res = await request(app, "GET", "/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect((res.body as { id: string }).id).toBe("user-test");
  });

  it("returns 404 when the user does not exist in the database", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const token = makeToken("ghost-user");
    const app = buildApp();
    const res = await request(app, "GET", "/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
  });
});

describe("GET /users/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const app = buildApp();
    const res = await request(app, "GET", "/users/search?q=alice");
    expect(res.status).toBe(401);
  });

  it("returns empty array for queries shorter than 2 characters", async () => {
    const token = makeToken();
    const app = buildApp();
    const res = await request(app, "GET", "/users/search?q=a", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    // prisma should NOT be called for trivially short queries
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("passes take: 20 to prisma to enforce the 20-result cap", async () => {
    prismaMock.user.findMany.mockResolvedValue([]);

    const token = makeToken();
    const app = buildApp();
    await request(app, "GET", "/users/search?q=alice", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 }),
    );
  });

  it("returns results from prisma", async () => {
    const fakeUsers = [
      { id: "u1", displayName: "Alice", avatarUrl: null, rating: 1200 },
    ];
    prismaMock.user.findMany.mockResolvedValue(fakeUsers);

    const token = makeToken();
    const app = buildApp();
    const res = await request(app, "GET", "/users/search?q=alice", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(fakeUsers);
  });
});

describe("GET /users/:displayName/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the user profile (no auth required)", async () => {
    const fakeUser = {
      id: "u1",
      displayName: "Alice",
      avatarUrl: null,
      rating: 1200,
      createdAt: new Date().toISOString(),
    };
    prismaMock.user.findFirst.mockResolvedValue(fakeUser);

    const app = buildApp();
    const res = await request(app, "GET", "/users/Alice/profile");

    expect(res.status).toBe(200);
    expect((res.body as { displayName: string }).displayName).toBe("Alice");
  });

  it("returns 404 when the display name is not found", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    const app = buildApp();
    const res = await request(app, "GET", "/users/Ghost/profile");

    expect(res.status).toBe(404);
  });
});
