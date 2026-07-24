import http from "node:http";

import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "../../utils/errors";

const prismaMock = vi.hoisted(() => ({
  user: {
    findFirst: vi.fn(),
  },
}));

vi.mock("../../models/prismaClient", () => ({
  prisma: prismaMock,
}));

vi.mock("../../middleware/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    const authorization = req.headers.authorization;
    if (authorization !== "Bearer test-token") {
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

async function createUsersTestApp(): Promise<Express> {
  const { default: usersRouter } = await import("../users");
  const { errorHandler } = await import("../../middleware/errorHandler");
  const app = express();

  app.use(express.json());
  app.use("/api/v1/users", usersRouter);
  app.use(errorHandler);

  return app;
}

describe("users routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication for profile lookup", async () => {
    const app = await createUsersTestApp();

    const response = await request(app, "/api/v1/users/Alice/profile");

    expect(response.status).toBe(401);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it("returns a minimized profile to authenticated callers", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      displayName: "Alice",
      avatarUrl: null,
      rating: 1200,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const app = await createUsersTestApp();

    const response = await request(app, "/api/v1/users/Alice/profile", {
      Authorization: "Bearer test-token",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: "user-1",
      displayName: "Alice",
      avatarUrl: null,
      rating: 1200,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { id: "Alice" },
          { displayName: { equals: "Alice", mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        rating: true,
        createdAt: true,
      },
    });
  });
});
