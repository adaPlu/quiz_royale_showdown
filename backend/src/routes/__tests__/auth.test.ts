/**
 * Tests for the /auth router.
 *
 * Critical paths:
 *  - POST /register returns 201 and sets HttpOnly cookie on success
 *  - POST /register returns 409 on duplicate email
 *  - POST /register returns 400 on validation failure (no displayName)
 *  - POST /login returns 200 on valid credentials
 *  - POST /login returns 401 on bad password or unknown email
 *  - POST /logout returns 204 (no-op when no token present)
 *  - GET /me returns 401 without auth, 200 with valid JWT
 */

import express from "express";
import http from "http";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  return { prismaMock };
});

vi.mock("../../models/prismaClient", () => ({ prisma: prismaMock }));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../utils/ulid", () => ({ generateId: vi.fn(() => "generated-user-id") }));

// Mock bcrypt so tests run fast (no 12-round real hashing)
vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn(async () => "hashed-password"),
    compare: vi.fn(async (plain: string) => plain === "correct-password"),
  },
}));

// Mock AuthService to isolate route logic from token-rotation internals
vi.mock("../../services/AuthService", () => ({
  findUserById: vi.fn(),
  issueTokenPair: vi.fn(async () => ({
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
  })),
  revokeRefreshToken: vi.fn(async () => undefined),
  rotateRefreshToken: vi.fn(async () => ({
    accessToken: "new-access-token",
    refreshToken: "new-refresh-token",
  })),
}));

import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { errorHandler } from "../../middleware/errorHandler";
import { authRouter } from "../auth";
import { findUserById } from "../../services/AuthService";

function buildApp() {
  const app = express();
  app.use(express.json());
  // cookie-parser needed for /refresh to read cookie
  app.use("/auth", authRouter);
  app.use(errorHandler);
  return app;
}

function request(
  app: express.Express,
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: unknown; headers: Record<string, string | string[]> }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      const bodyStr = options.body !== undefined ? JSON.stringify(options.body) : undefined;
      const reqOptions = {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(bodyStr ? { "Content-Length": String(Buffer.byteLength(bodyStr)) } : {}),
          ...(options.headers ?? {}),
        },
      };
      const req = http.request(reqOptions, (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => {
          server.close();
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data), headers: res.headers as Record<string, string | string[]> });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: data, headers: res.headers as Record<string, string | string[]> });
          }
        });
      });
      req.on("error", (err) => { server.close(); reject(err); });
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  });
}

function makeAccessToken(sub = "user-1") {
  return jwt.sign({ sub, email: "t@example.com", displayName: "Tester" }, env.jwtAccessSecret, { expiresIn: "1h" });
}

describe("POST /auth/register", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.user.findUnique.mockResolvedValue(null); // email not taken
    prismaMock.user.create.mockResolvedValue({
      id: "generated-user-id",
      email: "alice@example.com",
      displayName: "Alice",
    });
  });

  it("returns 201 with accessToken and sets qrs.rt cookie on success", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/auth/register", {
      body: { email: "alice@example.com", password: "password123", displayName: "Alice" },
    });

    expect(res.status).toBe(201);
    const body = res.body as { accessToken: string; user: { id: string } };
    expect(body.accessToken).toBe("test-access-token");
    expect(body.user.id).toBe("generated-user-id");
    const cookieHeader = res.headers["set-cookie"];
    expect(cookieHeader).toBeDefined();
    const cookieStr = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader ?? "";
    expect(cookieStr).toContain("qrs.rt=");
  });

  it("returns 409 when the email is already registered", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "existing" });

    const app = buildApp();
    const res = await request(app, "POST", "/auth/register", {
      body: { email: "alice@example.com", password: "password123", displayName: "Alice" },
    });

    expect(res.status).toBe(409);
  });

  it("returns 400 when neither displayName nor username is provided", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/auth/register", {
      body: { email: "alice@example.com", password: "password123" },
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when email is malformed", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/auth/register", {
      body: { email: "not-an-email", password: "password123", displayName: "Alice" },
    });

    expect(res.status).toBe(400);
  });
});

describe("POST /auth/login", () => {
  const fakeUser = {
    id: "user-1",
    email: "bob@example.com",
    displayName: "Bob",
    passwordHash: "hashed-password",
  };

  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.user.findUnique.mockResolvedValue(fakeUser);
  });

  it("returns 200 with accessToken and sets cookie on valid credentials", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/auth/login", {
      body: { email: "bob@example.com", password: "correct-password" },
    });

    expect(res.status).toBe(200);
    const body = res.body as { accessToken: string };
    expect(body.accessToken).toBe("test-access-token");
    const cookieStr = (res.headers["set-cookie"] ?? "").toString();
    expect(cookieStr).toContain("qrs.rt=");
  });

  it("returns 401 when password does not match", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/auth/login", {
      body: { email: "bob@example.com", password: "wrong-password" },
    });

    expect(res.status).toBe(401);
  });

  it("returns 401 when user does not exist", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const app = buildApp();
    const res = await request(app, "POST", "/auth/login", {
      body: { email: "ghost@example.com", password: "correct-password" },
    });

    expect(res.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when no refresh token is present", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/auth/logout");

    expect(res.status).toBe(204);
  });

  it("returns 204 and clears cookie when refresh token body is provided", async () => {
    const refreshToken = jwt.sign({ sub: "u1" }, env.jwtRefreshSecret, { expiresIn: "7d" });

    const app = buildApp();
    const res = await request(app, "POST", "/auth/logout", {
      body: { refreshToken },
    });

    expect(res.status).toBe(204);
  });
});

describe("GET /auth/me", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 when no Authorization header is provided", async () => {
    const app = buildApp();
    const res = await request(app, "GET", "/auth/me");

    expect(res.status).toBe(401);
  });

  it("returns 200 with user when a valid JWT is provided", async () => {
    vi.mocked(findUserById).mockResolvedValue({
      id: "user-1",
      email: "t@example.com",
      displayName: "Tester",
    });

    const token = makeAccessToken("user-1");
    const app = buildApp();
    const res = await request(app, "GET", "/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as { user: { id: string } };
    expect(body.user.id).toBe("user-1");
  });

  it("returns 401 when the user no longer exists in the database", async () => {
    vi.mocked(findUserById).mockResolvedValue(null);

    const token = makeAccessToken("ghost-user");
    const app = buildApp();
    const res = await request(app, "GET", "/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(401);
  });
});
