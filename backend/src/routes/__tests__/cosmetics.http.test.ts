import http from "node:http";

import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "../../utils/errors";

const prismaMock = vi.hoisted(() => ({
  cosmetic: {
    findMany: vi.fn(),
  },
  userCosmetic: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(),
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
      sub: "user-1",
      email: "user@example.com",
      displayName: "User",
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

async function createCosmeticsTestApp(): Promise<Express> {
  const { default: cosmeticsRouter } = await import("../cosmetics");
  const { errorHandler } = await import("../../middleware/errorHandler");
  const app = express();

  app.use(express.json());
  app.use("/api/v1/cosmetics", cosmeticsRouter);
  app.use(errorHandler);

  return app;
}

describe("cosmetics routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication for the full catalog", async () => {
    const app = await createCosmeticsTestApp();

    const response = await request(app, "/api/v1/cosmetics");

    expect(response.status).toBe(401);
    expect(prismaMock.cosmetic.findMany).not.toHaveBeenCalled();
  });

  it("returns the catalog for authenticated users", async () => {
    prismaMock.cosmetic.findMany.mockResolvedValue([{ id: "cosmetic-1", name: "Crown" }]);
    const app = await createCosmeticsTestApp();

    const response = await request(app, "/api/v1/cosmetics", {
      Authorization: "Bearer test-token",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ id: "cosmetic-1", name: "Crown" }]);
  });
});
