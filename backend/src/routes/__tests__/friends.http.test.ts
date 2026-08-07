import http from "node:http";

import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "../../utils/errors";

const REQUESTER_ID = "02ARZ3NDEKTSV4RRFFQ69G5FAV";
const ADDRESSEE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const FRIENDSHIP_ID = "03ARZ3NDEKTSV4RRFFQ69G5FAV";

const prismaMock = vi.hoisted(() => ({
  friendship: {
    create: vi.fn(),
    delete: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  xpEvent: {
    groupBy: vi.fn(),
  },
}));

vi.mock("../../models/prismaClient", () => ({
  prisma: prismaMock,
}));

vi.mock("../../middleware/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.slice("Bearer ".length);
    if (!token) {
      next(new UnauthorizedError("Missing or malformed Authorization header"));
      return;
    }
    req.jwtClaims = {
      sub: token,
      email: `${token}@example.com`,
      displayName: token,
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

async function request(
  app: Express,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
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
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
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

async function createFriendsTestApp(): Promise<Express> {
  const { default: friendsRouter } = await import("../friends");
  const { errorHandler } = await import("../../middleware/errorHandler");
  const app = express();

  app.use(express.json());
  app.use("/api/v1/friends", friendsRouter);
  app.use(errorHandler);

  return app;
}

describe("friends routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves requester/addressee direction and prevents requester self-acceptance", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: ADDRESSEE_ID });
    prismaMock.friendship.findFirst.mockResolvedValue(null);
    prismaMock.friendship.create.mockResolvedValue({
      id: FRIENDSHIP_ID,
      requesterId: REQUESTER_ID,
      addresseeId: ADDRESSEE_ID,
      status: "PENDING",
    });
    prismaMock.friendship.findUnique.mockResolvedValue({
      id: FRIENDSHIP_ID,
      requesterId: REQUESTER_ID,
      addresseeId: ADDRESSEE_ID,
      status: "PENDING",
    });

    const app = await createFriendsTestApp();

    const createResponse = await request(
      app,
      "POST",
      "/api/v1/friends/request",
      { addresseeId: ADDRESSEE_ID },
      { Authorization: `Bearer ${REQUESTER_ID}` },
    );
    const acceptResponse = await request(
      app,
      "PUT",
      `/api/v1/friends/${FRIENDSHIP_ID}/accept`,
      undefined,
      { Authorization: `Bearer ${REQUESTER_ID}` },
    );

    expect(createResponse.status).toBe(201);
    expect(prismaMock.friendship.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requesterId: REQUESTER_ID,
          addresseeId: ADDRESSEE_ID,
          status: "PENDING",
        }),
      }),
    );
    expect(acceptResponse.status).toBe(403);
    expect(prismaMock.friendship.update).not.toHaveBeenCalled();
  });
});
