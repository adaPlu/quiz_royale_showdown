/**
 * Tests for the /powerups router.
 *
 * Critical paths:
 *  - GET /inventory requires authentication
 *  - GET /inventory returns the user's power-up list from PowerUpService
 */

import express from "express";
import http from "http";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { getPowerUpInventoryMock } = vi.hoisted(() => {
  const getPowerUpInventoryMock = vi.fn();
  return { getPowerUpInventoryMock };
});

vi.mock("../../services/PowerUpService", () => ({
  getPowerUpInventory: getPowerUpInventoryMock,
}));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { errorHandler } from "../../middleware/errorHandler";
import powerupsRouter from "../powerups";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/powerups", powerupsRouter);
  app.use(errorHandler);
  return app;
}

function makeToken(sub = "user-1") {
  return jwt.sign({ sub, email: "t@example.com", displayName: "Tester" }, env.jwtAccessSecret, { expiresIn: "1h" });
}

function request(
  app: express.Express,
  method: string,
  path: string,
  options: { headers?: Record<string, string> } = {},
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      const req = http.request(
        { hostname: "127.0.0.1", port, path, method, headers: { "Content-Type": "application/json", ...(options.headers ?? {}) } },
        (res) => {
          let data = "";
          res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
          res.on("end", () => {
            server.close();
            try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) }); }
            catch { resolve({ status: res.statusCode ?? 0, body: data }); }
          });
        },
      );
      req.on("error", (err) => { server.close(); reject(err); });
      req.end();
    });
  });
}

describe("GET /powerups/inventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no Authorization header is provided", async () => {
    const app = buildApp();
    const res = await request(app, "GET", "/powerups/inventory");
    expect(res.status).toBe(401);
  });

  it("returns 200 with inventory array for authenticated user", async () => {
    const inventory = [
      { powerUpId: "pu-1", code: "DOUBLE_DOWN", quantity: 2 },
      { powerUpId: "pu-2", code: "SHIELD", quantity: 1 },
    ];
    getPowerUpInventoryMock.mockResolvedValue(inventory);

    const token = makeToken("user-1");
    const app = buildApp();
    const res = await request(app, "GET", "/powerups/inventory", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(inventory);
    expect(getPowerUpInventoryMock).toHaveBeenCalledWith("user-1");
  });

  it("returns empty array when user has no power-ups", async () => {
    getPowerUpInventoryMock.mockResolvedValue([]);

    const token = makeToken("user-2");
    const app = buildApp();
    const res = await request(app, "GET", "/powerups/inventory", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
