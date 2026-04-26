/**
 * Tests for the /cosmetics router.
 *
 * Critical path: POST /cosmetics/equip must return 403 when the
 * authenticated user does not own the requested cosmetic.
 */

import express from "express";
import http from "http";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    cosmetic: {
      findMany: vi.fn(),
    },
    userCosmetic: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { prismaMock };
});

vi.mock("../../models/prismaClient", () => ({ prisma: prismaMock }));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Stub auth so we don't need real JWTs
vi.mock("../../middleware/auth", () => ({
  requireAuth: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    req.jwtClaims = {
      sub: "user-test",
      email: "test@example.com",
      displayName: "Tester",
      iat: 0,
      exp: 9999999999,
    };
    next();
  },
}));

import { errorHandler } from "../../middleware/errorHandler";
import cosmeticsRouter from "../cosmetics";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/cosmetics", cosmeticsRouter);
  app.use(errorHandler);
  return app;
}

function request(
  app: express.Express,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;
      const options = {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
        },
      };

      const req = http.request(options, (res) => {
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

describe("GET /cosmetics — catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns all cosmetics from the database", async () => {
    const fakeCosmetics = [
      { id: "hat-1", type: "HAT", name: "Top Hat", rarity: "RARE" },
      { id: "avatar-1", type: "AVATAR_FRAME", name: "Gold Frame", rarity: "EPIC" },
    ];
    prismaMock.cosmetic.findMany.mockResolvedValue(fakeCosmetics);

    const app = buildApp();
    const res = await request(app, "GET", "/cosmetics");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(fakeCosmetics);
    expect(prismaMock.cosmetic.findMany).toHaveBeenCalledWith({
      orderBy: [{ type: "asc" }],
    });
  });
});

describe("GET /cosmetics/owned", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns owned cosmetics for the authenticated user", async () => {
    const fakeOwned = [
      {
        userId: "user-test",
        cosmeticId: "hat-1",
        equipped: true,
        cosmetic: { id: "hat-1", type: "HAT", name: "Top Hat" },
      },
    ];
    prismaMock.userCosmetic.findMany.mockResolvedValue(fakeOwned);

    const app = buildApp();
    const res = await request(app, "GET", "/cosmetics/owned");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(fakeOwned);
    expect(prismaMock.userCosmetic.findMany).toHaveBeenCalledWith({
      where: { userId: "user-test" },
      include: { cosmetic: true },
    });
  });
});

describe("POST /cosmetics/equip — ownership check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when the user does not own the cosmetic", async () => {
    // Simulate no ownership record found
    prismaMock.userCosmetic.findUnique.mockResolvedValue(null);

    const app = buildApp();
    const res = await request(app, "POST", "/cosmetics/equip", {
      cosmeticId: "hat-not-owned",
    });

    expect(res.status).toBe(403);
    const body = res.body as { error: string; code: string };
    expect(body.error).toMatch(/do not own/i);
    expect(body.code).toBe("FORBIDDEN");
    // Transaction must NOT be called when ownership fails
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("equips the cosmetic and returns success when the user owns it", async () => {
    const ownershipRecord = {
      userId: "user-test",
      cosmeticId: "hat-1",
      equipped: false,
      cosmetic: { id: "hat-1", type: "HAT", name: "Top Hat" },
    };
    prismaMock.userCosmetic.findUnique.mockResolvedValue(ownershipRecord);
    prismaMock.$transaction.mockResolvedValue([{ count: 1 }, ownershipRecord]);

    const app = buildApp();
    const res = await request(app, "POST", "/cosmetics/equip", {
      cosmeticId: "hat-1",
    });

    expect(res.status).toBe(200);
    const body = res.body as { success: boolean; equipped: string };
    expect(body.success).toBe(true);
    expect(body.equipped).toBe("hat-1");
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when cosmeticId is missing from the body", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/cosmetics/equip", {});
    expect(res.status).toBe(400);
  });

  it("returns 400 when cosmeticId is an empty string", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/cosmetics/equip", { cosmeticId: "" });
    expect(res.status).toBe(400);
  });
});
