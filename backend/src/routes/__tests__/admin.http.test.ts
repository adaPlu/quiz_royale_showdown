import http from "node:http";

import express from "express";
import type { Express } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  questionBank: {
    count: vi.fn(),
  },
}));

const questionGeneratorServiceMock = vi.hoisted(() => ({
  isAvailable: true,
  generateAndStore: vi.fn(),
  refillIfNeeded: vi.fn(),
}));

const TEST_ADMIN_SECRET = "change-me-in-production";

vi.mock("../../models/prismaClient", () => ({
  prisma: prismaMock,
}));

vi.mock("../../services/QuestionGeneratorService", () => ({
  questionGeneratorService: questionGeneratorServiceMock,
}));

interface TestResponse {
  status: number;
  body: unknown;
  text: string;
  headers: Headers;
}

async function request(
  app: Express,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<TestResponse> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a port");
  }

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();

    return {
      status: response.status,
      text,
      body: text ? (JSON.parse(text) as unknown) : null,
      headers: response.headers,
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function createAdminTestApp(): Promise<Express> {
  const { adminRouter } = await import("../admin");
  const { errorHandler } = await import("../../middleware/errorHandler");
  const app = express();

  app.use(express.json());
  app.use("/api/v1/admin", adminRouter);
  app.use(errorHandler);

  return app;
}

describe("admin routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_SECRET = TEST_ADMIN_SECRET;
    process.env.NODE_ENV = "test";
    questionGeneratorServiceMock.isAvailable = true;
    questionGeneratorServiceMock.generateAndStore.mockResolvedValue(0);
    questionGeneratorServiceMock.refillIfNeeded.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("accepts the admin secret only from the x-admin-key header", async () => {
    prismaMock.questionBank.count.mockResolvedValueOnce(10).mockResolvedValueOnce(8);
    const app = await createAdminTestApp();

    const response = await request(app, "GET", "/api/v1/admin/questions/count", undefined, {
      "x-admin-key": TEST_ADMIN_SECRET,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ total: 10, active: 8 });
  });

  it("rejects adminKey in the query string", async () => {
    const app = await createAdminTestApp();

    const response = await request(
      app,
      "GET",
      `/api/v1/admin/questions/count?adminKey=${TEST_ADMIN_SECRET}`
    );

    expect(response.status).toBe(401);
    expect(prismaMock.questionBank.count).not.toHaveBeenCalled();
  });

  it("rejects adminKey in the request body", async () => {
    const app = await createAdminTestApp();

    const response = await request(app, "POST", "/api/v1/admin/questions/refill", {
      adminKey: TEST_ADMIN_SECRET,
    });

    expect(response.status).toBe(401);
    expect(questionGeneratorServiceMock.refillIfNeeded).not.toHaveBeenCalled();
  });

  it("rate limits admin routes independently", async () => {
    prismaMock.questionBank.count.mockResolvedValue(0);
    const app = await createAdminTestApp();

    for (let requestNumber = 0; requestNumber < 20; requestNumber += 1) {
      const response = await request(app, "GET", "/api/v1/admin/questions/count", undefined, {
        "x-admin-key": TEST_ADMIN_SECRET,
      });
      expect(response.status).toBe(200);
    }

    const limited = await request(app, "GET", "/api/v1/admin/questions/count", undefined, {
      "x-admin-key": TEST_ADMIN_SECRET,
    });

    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({
      error: "Too many admin requests, please try again later.",
      code: "RATE_LIMITED",
    });
  });

  it("clamps question generation count to the configured maximum", async () => {
    const app = await createAdminTestApp();

    const response = await request(
      app,
      "POST",
      "/api/v1/admin/questions/generate",
      { count: 10_000 },
      { "x-admin-key": TEST_ADMIN_SECRET }
    );

    expect(response.status).toBe(200);
    expect(questionGeneratorServiceMock.generateAndStore).toHaveBeenCalledWith(60);
    expect(response.body).toMatchObject({
      message: "OpenAI question generation completed",
      status: "completed",
      requested: 60,
      added: 0,
    });
  });

  it("rejects invalid question generation counts", async () => {
    const app = await createAdminTestApp();

    const response = await request(
      app,
      "POST",
      "/api/v1/admin/questions/generate",
      { count: 0 },
      { "x-admin-key": TEST_ADMIN_SECRET }
    );

    expect(response.status).toBe(400);
    expect(questionGeneratorServiceMock.generateAndStore).not.toHaveBeenCalled();
  });

  it("returns a failure when OpenAI generation fails", async () => {
    questionGeneratorServiceMock.generateAndStore.mockRejectedValue(
      new Error("generation failed"),
    );
    const app = await createAdminTestApp();

    const response = await request(
      app,
      "POST",
      "/api/v1/admin/questions/generate",
      { count: 5 },
      { "x-admin-key": TEST_ADMIN_SECRET }
    );

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      error: "generation failed",
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});
