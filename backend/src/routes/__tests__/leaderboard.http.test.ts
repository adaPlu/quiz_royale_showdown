import http from "node:http";

import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "../../utils/errors";

const prismaMock = vi.hoisted(() => ({
  user: {
    findMany: vi.fn(),
  },
}));

vi.mock("../../models/prismaClient", () => ({
  prisma: prismaMock,
}));

vi.mock("../../middleware/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    if (req.headers.authorization !== "Bearer test-token") {
      next(new UnauthorizedError("Missing or malformed Authorization header"));
      return;
    }
    req.jwtClaims = {
      sub: "viewer-1",
      email: "viewer@example.com",
      displayName: "Viewer",
      iat: 1,
      exp: 2,
    };
    next();
  },
}));

interface TestResponse {
  status: number;
  body: unknown;
  text: string;
}

async function request(app: Express, path: string, headers?: Record<string, string>): Promise<TestResponse> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a port");
  }

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { headers });
    const text = await response.text();

    return {
      status: response.status,
      text,
      body: text ? (JSON.parse(text) as unknown) : null,
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function createLeaderboardTestApp(): Promise<Express> {
  const { default: leaderboardRouter } = await import("../leaderboard");
  const { errorHandler } = await import("../../middleware/errorHandler");
  const app = express();

  app.use(express.json());
  app.use("/api/v1/leaderboard", leaderboardRouter);
  app.use(errorHandler);

  return app;
}

describe("leaderboard routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication for friends leaderboard", async () => {
    const app = await createLeaderboardTestApp();

    const response = await request(app, "/api/v1/leaderboard/friends");

    expect(response.status).toBe(401);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("returns an empty friends leaderboard instead of global top users", async () => {
    const app = await createLeaderboardTestApp();

    const response = await request(app, "/api/v1/leaderboard/friends", {
      Authorization: "Bearer test-token",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });
});
