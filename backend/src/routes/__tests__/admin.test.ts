/**
 * Tests for the /admin router — secret gating.
 *
 * The middleware blocks requests with a missing or wrong X-Admin-Key header
 * and lets through requests with the correct secret.
 */

import express from "express";
import http from "http";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { prismaMock, questionGeneratorMock } = vi.hoisted(() => {
  const prismaMock = {
    questionBank: {
      count: vi.fn(),
    },
  };

  const questionGeneratorMock = {
    isAvailable: false as boolean,
    generateAndStore: vi.fn(),
    refillIfNeeded: vi.fn(),
  };

  return { prismaMock, questionGeneratorMock };
});

vi.mock("../../models/prismaClient", () => ({ prisma: prismaMock }));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../services/QuestionGeneratorService", () => ({
  questionGeneratorService: questionGeneratorMock,
}));

// Expose env so we know what the secret is without hard-coding it
import { env } from "../../config/env";
import { errorHandler } from "../../middleware/errorHandler";
import { adminRouter } from "../admin";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/admin", adminRouter);
  app.use(errorHandler);
  return app;
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
      const bodyStr =
        options.body !== undefined ? JSON.stringify(options.body) : undefined;

      const reqOptions = {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
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

describe("Admin router — secret gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.questionBank.count.mockResolvedValue(42);
  });

  it("returns 401 when the X-Admin-Key header is missing", async () => {
    const app = buildApp();
    const res = await request(app, "GET", "/admin/questions/count");

    expect(res.status).toBe(401);
    const body = res.body as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when the X-Admin-Key header has the wrong value", async () => {
    const app = buildApp();
    const res = await request(app, "GET", "/admin/questions/count", {
      headers: { "x-admin-key": "definitely-wrong-secret" },
    });

    expect(res.status).toBe(401);
    const body = res.body as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when the adminKey query param has the wrong value", async () => {
    const app = buildApp();
    const res = await request(
      app,
      "GET",
      "/admin/questions/count?adminKey=wrong-key",
    );

    expect(res.status).toBe(401);
  });

  it("passes through with the correct X-Admin-Key header and returns question counts", async () => {
    prismaMock.questionBank.count
      .mockResolvedValueOnce(100) // total
      .mockResolvedValueOnce(80); // active

    const app = buildApp();
    const res = await request(app, "GET", "/admin/questions/count", {
      headers: { "x-admin-key": env.adminSecret },
    });

    expect(res.status).toBe(200);
    const body = res.body as { total: number; active: number };
    expect(body.total).toBe(100);
    expect(body.active).toBe(80);
  });

  it("passes through with the correct adminKey query param", async () => {
    prismaMock.questionBank.count
      .mockResolvedValueOnce(50)
      .mockResolvedValueOnce(40);

    const app = buildApp();
    const res = await request(
      app,
      "GET",
      `/admin/questions/count?adminKey=${encodeURIComponent(env.adminSecret)}`,
    );

    expect(res.status).toBe(200);
    const body = res.body as { total: number; active: number };
    expect(body.total).toBe(50);
  });

  it("returns 503 for POST /questions/generate when AI is unavailable", async () => {
    questionGeneratorMock.isAvailable = false;

    const app = buildApp();
    const res = await request(app, "POST", "/admin/questions/generate", {
      headers: { "x-admin-key": env.adminSecret },
      body: { count: 10 },
    });

    expect(res.status).toBe(503);
    const body = res.body as { error: string };
    expect(body.error).toMatch(/ANTHROPIC_API_KEY/i);
  });

  it("returns 200 and starts generation when AI is available", async () => {
    questionGeneratorMock.isAvailable = true;
    questionGeneratorMock.generateAndStore.mockResolvedValue(undefined);

    const app = buildApp();
    const res = await request(app, "POST", "/admin/questions/generate", {
      headers: { "x-admin-key": env.adminSecret },
      body: { count: 5 },
    });

    expect(res.status).toBe(200);
    const body = res.body as { status: string };
    expect(body.status).toBe("running");
  });
});
