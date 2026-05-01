import type { RequestHandler, Router } from "express";
import express from "express";
import http from "node:http";
import { describe, expect, it, vi } from "vitest";

const limiterMocks = vi.hoisted(() => ({
  apiLimiter: vi.fn((_req, _res, next) => next()) as RequestHandler,
  authLimiter: vi.fn((_req, _res, next) => next()) as RequestHandler
}));

function emptyRouter(): Router {
  return express.Router();
}

vi.mock("../middleware/rateLimiter", () => limiterMocks);
vi.mock("../routes/auth", () => ({ authRouter: emptyRouter() }));
vi.mock("../routes/health", () => ({ healthRouter: emptyRouter() }));
vi.mock("../routes/rooms", () => ({ roomsRouter: emptyRouter() }));

async function request(app: express.Express, path: string) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a port");
  }

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
    const text = await response.text();

    return {
      status: response.status,
      body: text ? (JSON.parse(text) as unknown) : null
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe("createApp", () => {
  it("mounts the general API limiter before the auth-specific limiter", async () => {
    const { createApp } = await import("../app");
    const app = createApp() as unknown as {
      _router: {
        stack: Array<{ handle: RequestHandler }>;
      };
    };

    const stack = app._router.stack;
    const apiLimiterIndex = stack.findIndex((layer) => layer.handle === limiterMocks.apiLimiter);
    const authLimiterIndex = stack.findIndex((layer) => layer.handle === limiterMocks.authLimiter);

    expect(apiLimiterIndex).toBeGreaterThan(-1);
    expect(authLimiterIndex).toBeGreaterThan(-1);
    expect(apiLimiterIndex).toBeLessThan(authLimiterIndex);
  });

  it("returns structured 404 errors for unknown routes", async () => {
    const { createApp } = await import("../app");
    const app = createApp();

    const response = await request(app, "/not-mounted");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: "Route not found",
      code: "NOT_FOUND"
    });
  });
});
