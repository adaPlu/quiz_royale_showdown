import type { RequestHandler, Router } from "express";
import express from "express";
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
});
