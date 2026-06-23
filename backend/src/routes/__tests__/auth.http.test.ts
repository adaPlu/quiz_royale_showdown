import http from "node:http";

import cookieParser from "cookie-parser";
import express from "express";
import type { Express } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
}));

const authServiceMock = vi.hoisted(() => ({
  findUserById: vi.fn(),
  issueTokenPair: vi.fn(),
  revokeRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
}));

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-password"),
    compare: vi.fn(),
  },
}));

vi.mock("../../models/prismaClient", () => ({
  prisma: prismaMock,
}));

vi.mock("../../services/AuthService", () => authServiceMock);

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

async function createAuthTestApp(): Promise<Express> {
  const { authRouter } = await import("../auth");
  const { errorHandler } = await import("../../middleware/errorHandler");
  const app = express();

  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/v1/auth", authRouter);
  app.use(errorHandler);

  return app;
}

describe("auth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns 201 from register with the auth payload", async () => {
    const user = {
      id: "user-1",
      email: "new@example.com",
      displayName: "New User",
    };
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue(user);
    authServiceMock.issueTokenPair.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    const app = await createAuthTestApp();

    const response = await request(app, "POST", "/api/v1/auth/register", {
      email: "NEW@EXAMPLE.COM",
      username: "NewUser",
      password: "password123",
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      user,
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    expect(response.headers.get("set-cookie")).toContain("qrs.rt=refresh-token");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "new@example.com",
          displayName: "NewUser",
        }),
      })
    );
  });

  it("sets the refresh cookie from login while preserving the JSON refresh token", async () => {
    const bcrypt = (await import("bcrypt")).default;
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    const user = {
      id: "user-1",
      email: "login@example.com",
      displayName: "Login User",
      passwordHash: "hashed-password",
    };
    prismaMock.user.findUnique.mockResolvedValue(user);
    authServiceMock.issueTokenPair.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    const app = await createAuthTestApp();

    const response = await request(app, "POST", "/api/v1/auth/login", {
      email: "LOGIN@EXAMPLE.COM",
      password: "password123",
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    expect(response.headers.get("set-cookie")).toContain("qrs.rt=refresh-token");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("refreshes tokens from the HttpOnly refresh cookie without a body token", async () => {
    authServiceMock.rotateRefreshToken.mockResolvedValue({
      accessToken: "next-access-token",
      refreshToken: "next-refresh-token",
    });
    const app = await createAuthTestApp();

    const response = await request(
      app,
      "POST",
      "/api/v1/auth/refresh",
      {},
      { Cookie: `qrs.rt=${encodeURIComponent("r".repeat(20))}` }
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      accessToken: "next-access-token",
      refreshToken: "next-refresh-token",
    });
    expect(authServiceMock.rotateRefreshToken).toHaveBeenCalledWith("r".repeat(20));
    expect(response.headers.get("set-cookie")).toContain("qrs.rt=next-refresh-token");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("returns structured 400 validation errors from register", async () => {
    const app = await createAuthTestApp();

    const response = await request(app, "POST", "/api/v1/auth/register", {
      email: "not-an-email",
      password: "short",
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
    });
  });

  it("returns 204 from logout and no response body", async () => {
    authServiceMock.revokeRefreshToken.mockResolvedValue(undefined);
    const app = await createAuthTestApp();

    const response = await request(app, "POST", "/api/v1/auth/logout", {
      refreshToken: "r".repeat(20),
    });

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
    expect(authServiceMock.revokeRefreshToken).toHaveBeenCalledWith("r".repeat(20));
    expect(response.headers.get("set-cookie")).toContain("qrs.rt=");
  });

  it("returns 204 from logout using only the refresh cookie", async () => {
    authServiceMock.revokeRefreshToken.mockResolvedValue(undefined);
    const app = await createAuthTestApp();

    const response = await request(
      app,
      "POST",
      "/api/v1/auth/logout",
      {},
      { Cookie: `qrs.rt=${encodeURIComponent("c".repeat(20))}` }
    );

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
    expect(authServiceMock.revokeRefreshToken).toHaveBeenCalledWith("c".repeat(20));
    expect(response.headers.get("set-cookie")).toContain("qrs.rt=");
  });
});
