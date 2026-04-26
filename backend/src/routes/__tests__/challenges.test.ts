/**
 * Tests for POST /challenges/:id/progress — Zod delta validation.
 *
 * Strategy: build a minimal Express app with the router under test and
 * the global error handler so that thrown AppErrors and inline
 * res.status(400).json() calls are both exercised through the full
 * middleware stack.
 */

import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted mocks (must appear before any imports that touch the modules) ───

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    xpEvent: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  return { prismaMock };
});

vi.mock("../../models/prismaClient", () => ({ prisma: prismaMock }));
vi.mock("../../utils/ulid", () => ({ generateId: vi.fn(() => "test-id") }));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock requireAuth so tests don't need real JWTs
vi.mock("../../middleware/auth", () => ({
  requireAuth: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    req.jwtClaims = {
      sub: "user-test",
      email: "test@example.com",
      displayName: "Tester",
      iat: 0,
      exp: 9999999999,
    };
    next();
  },
}));

import { errorHandler } from "../../middleware/errorHandler";
import challengesRouter from "../challenges";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/challenges", challengesRouter);
  app.use(errorHandler);
  return app;
}

// Lightweight fetch helper using Node's built-in http — avoids supertest dep
import http from "http";

function request(
  app: express.Express,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;
      const options = {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
        },
      };

      const req = http.request(options, (res) => {
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

const VALID_CHALLENGE_ID = "win_a_game"; // exists in DAILY_CHALLENGE_TEMPLATES

describe("POST /challenges/:id/progress — delta validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Prime prisma so valid requests don't blow up
    prismaMock.xpEvent.findFirst.mockResolvedValue(null);
    prismaMock.xpEvent.create.mockResolvedValue({ id: "test-id" });
  });

  it("returns 400 when delta is negative", async () => {
    const app = buildApp();
    const res = await request(app, "POST", `/challenges/${VALID_CHALLENGE_ID}/progress`, {
      delta: -1,
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when delta is zero", async () => {
    const app = buildApp();
    const res = await request(app, "POST", `/challenges/${VALID_CHALLENGE_ID}/progress`, {
      delta: 0,
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when delta is greater than 100", async () => {
    const app = buildApp();
    const res = await request(app, "POST", `/challenges/${VALID_CHALLENGE_ID}/progress`, {
      delta: 101,
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when delta is a float (non-integer)", async () => {
    const app = buildApp();
    const res = await request(app, "POST", `/challenges/${VALID_CHALLENGE_ID}/progress`, {
      delta: 1.5,
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when delta is a string (NaN-like)", async () => {
    const app = buildApp();
    const res = await request(app, "POST", `/challenges/${VALID_CHALLENGE_ID}/progress`, {
      delta: "not-a-number",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when delta is missing entirely", async () => {
    const app = buildApp();
    const res = await request(app, "POST", `/challenges/${VALID_CHALLENGE_ID}/progress`, {});
    expect(res.status).toBe(400);
  });

  it("accepts delta = 1 (lower boundary) and returns 200", async () => {
    const app = buildApp();
    const res = await request(app, "POST", `/challenges/${VALID_CHALLENGE_ID}/progress`, {
      delta: 1,
    });
    expect(res.status).toBe(200);
    expect((res.body as { progress: number }).progress).toBeGreaterThanOrEqual(0);
  });

  it("accepts delta = 100 (upper boundary) and returns 200", async () => {
    const app = buildApp();
    const res = await request(app, "POST", `/challenges/${VALID_CHALLENGE_ID}/progress`, {
      delta: 100,
    });
    expect(res.status).toBe(200);
  });

  it("returns 404 when the challenge id does not exist", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/challenges/nonexistent_challenge/progress", {
      delta: 1,
    });
    expect(res.status).toBe(404);
  });

  it("response body includes progress and target on success", async () => {
    const app = buildApp();
    const res = await request(app, "POST", `/challenges/${VALID_CHALLENGE_ID}/progress`, {
      delta: 1,
    });
    expect(res.status).toBe(200);
    const body = res.body as { progress: number; target: number; completed: boolean };
    expect(typeof body.progress).toBe("number");
    expect(typeof body.target).toBe("number");
    expect(typeof body.completed).toBe("boolean");
  });

  it("caps progress at the challenge target even with a large valid delta", async () => {
    // win_a_game has target = 1; delta = 50 should be capped to 1
    const app = buildApp();
    const res = await request(app, "POST", `/challenges/${VALID_CHALLENGE_ID}/progress`, {
      delta: 50,
    });
    expect(res.status).toBe(200);
    const body = res.body as { progress: number; target: number; completed: boolean };
    expect(body.progress).toBeLessThanOrEqual(body.target);
  });
});

describe("GET /challenges/daily", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.xpEvent.findMany.mockResolvedValue([]);
  });

  it("returns an array of 3 challenges with expected fields", async () => {
    const app = buildApp();
    const res = await request(app, "GET", "/challenges/daily");
    expect(res.status).toBe(200);
    const body = res.body as Array<{
      id: string;
      title: string;
      target: number;
      xpReward: number;
      progress: number;
      completed: boolean;
    }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(3);
    for (const challenge of body) {
      expect(typeof challenge.id).toBe("string");
      expect(typeof challenge.title).toBe("string");
      expect(typeof challenge.target).toBe("number");
      expect(typeof challenge.xpReward).toBe("number");
      expect(challenge.progress).toBeGreaterThanOrEqual(0);
      expect(typeof challenge.completed).toBe("boolean");
    }
  });
});
