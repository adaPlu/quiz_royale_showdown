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
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
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
vi.mock("../../utils/ulid", () => ({ generateId: vi.fn(() => "new-question-id") }));

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
    vi.resetAllMocks();
    prismaMock.questionBank.count.mockResolvedValue(42);
  });

  it("returns 403 when the X-Admin-Key header is missing", async () => {
    const app = buildApp();
    const res = await request(app, "GET", "/admin/questions/count");

    expect(res.status).toBe(403);
    const body = res.body as { error: string };
    expect(body.error).toBe("Forbidden");
  });

  it("returns 403 when the X-Admin-Key header has the wrong value", async () => {
    const app = buildApp();
    const res = await request(app, "GET", "/admin/questions/count", {
      headers: { "x-admin-key": "definitely-wrong-secret" },
    });

    expect(res.status).toBe(403);
    const body = res.body as { error: string };
    expect(body.error).toBe("Forbidden");
  });

  it("returns 403 when no valid auth header is provided", async () => {
    const app = buildApp();
    const res = await request(
      app,
      "GET",
      "/admin/questions/count?adminKey=wrong-key",
    );

    expect(res.status).toBe(403);
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

  it("returns 503 for POST /questions/generate when AI is unavailable", async () => {
    questionGeneratorMock.isAvailable = false;

    const app = buildApp();
    const res = await request(app, "POST", "/admin/questions/generate", {
      headers: { "x-admin-key": env.adminSecret },
      body: { count: 10 },
    });

    expect(res.status).toBe(503);
    const body = res.body as { error: string };
    expect(body.error).toMatch(/OPENAI_API_KEY/i);
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

describe("Admin router — x-admin-secret header and 403 gating", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.questionBank.count.mockResolvedValue(0);
  });

  it("returns 403 when x-admin-secret header is missing", async () => {
    const app = buildApp();
    const res = await request(app, "GET", "/admin/questions/count");
    expect(res.status).toBe(403);
  });

  it("returns 403 when x-admin-secret header has the wrong value", async () => {
    const app = buildApp();
    const res = await request(app, "GET", "/admin/questions/count", {
      headers: { "x-admin-secret": "totally-wrong-secret" },
    });
    expect(res.status).toBe(403);
  });

  it("passes through with the correct x-admin-secret header and returns 200", async () => {
    prismaMock.questionBank.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(8);

    const app = buildApp();
    const res = await request(app, "GET", "/admin/questions/count", {
      headers: { "x-admin-secret": env.adminSecret },
    });

    expect(res.status).toBe(200);
    const body = res.body as { total: number; active: number };
    expect(body.total).toBe(10);
  });
});

const VALID_QUESTION = {
  prompt: "What is 2 + 2?",
  optionA: "3",
  optionB: "4",
  optionC: "5",
  optionD: "6",
  correctIndex: 1,
  category: "Math",
  difficulty: "EASY" as const,
};

describe("Admin router — question CRUD", () => {
  const adminHeaders = { "x-admin-secret": env.adminSecret };

  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.questionBank.count.mockResolvedValue(0);
    prismaMock.questionBank.findMany.mockResolvedValue([]);
    prismaMock.questionBank.create.mockResolvedValue({ id: "new-question-id", ...VALID_QUESTION, isActive: true });
    prismaMock.questionBank.update.mockResolvedValue({ id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", ...VALID_QUESTION, isActive: true });
  });

  it("GET /questions returns paginated list with total, page, limit, questions", async () => {
    prismaMock.questionBank.count.mockResolvedValue(5);
    prismaMock.questionBank.findMany.mockResolvedValue([
      { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", prompt: "Q1?", optionA: "A", optionB: "B", optionC: "C", optionD: "D", correctIndex: 0, category: "Gen", difficulty: "EASY", isActive: true, lastUsedAt: null, createdAt: new Date().toISOString() },
    ]);

    const app = buildApp();
    const res = await request(app, "GET", "/admin/questions?page=1&limit=10", {
      headers: adminHeaders,
    });

    expect(res.status).toBe(200);
    const body = res.body as { total: number; page: number; limit: number; questions: unknown[] };
    expect(body.total).toBe(5);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(10);
    expect(body.questions).toHaveLength(1);
  });

  it("GET /questions with active=true filters to active questions only", async () => {
    const app = buildApp();
    await request(app, "GET", "/admin/questions?active=true", {
      headers: adminHeaders,
    });

    expect(prismaMock.questionBank.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
    expect(prismaMock.questionBank.count).toHaveBeenCalledWith({ where: { isActive: true } });
  });

  it("POST /questions creates a question and returns 201", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/admin/questions", {
      headers: adminHeaders,
      body: VALID_QUESTION,
    });

    expect(res.status).toBe(201);
    const body = res.body as { id: string };
    expect(body.id).toBe("new-question-id");
    expect(prismaMock.questionBank.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ prompt: VALID_QUESTION.prompt, isActive: true }),
      }),
    );
  });

  it("POST /questions returns 400 when body fails Zod validation", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/admin/questions", {
      headers: adminHeaders,
      body: { prompt: "hi" }, // missing required fields
    });

    expect(res.status).toBe(400);
    const body = res.body as { error: string };
    expect(body.error).toMatch(/validation/i);
  });

  it("PUT /questions/:id updates and returns the question", async () => {
    const app = buildApp();
    const res = await request(app, "PUT", "/admin/questions/01ARZ3NDEKTSV4RRFFQ69G5FAV", {
      headers: adminHeaders,
      body: { prompt: "Updated prompt?" },
    });

    expect(res.status).toBe(200);
    expect(prismaMock.questionBank.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV" },
        data: expect.objectContaining({ prompt: "Updated prompt?" }),
      }),
    );
  });

  it("DELETE /questions/:id soft-deletes (isActive=false) and returns 204", async () => {
    const app = buildApp();
    const res = await request(app, "DELETE", "/admin/questions/01ARZ3NDEKTSV4RRFFQ69G5FAV", {
      headers: adminHeaders,
    });

    expect(res.status).toBe(204);
    expect(prismaMock.questionBank.update).toHaveBeenCalledWith({
      where: { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV" },
      data: { isActive: false },
    });
  });

  it("PATCH /questions/:id/activate restores a soft-deleted question", async () => {
    const app = buildApp();
    const res = await request(app, "PATCH", "/admin/questions/01ARZ3NDEKTSV4RRFFQ69G5FAV/activate", {
      headers: adminHeaders,
    });

    expect(res.status).toBe(200);
    expect(prismaMock.questionBank.update).toHaveBeenCalledWith({
      where: { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV" },
      data: { isActive: true },
    });
  });
});
