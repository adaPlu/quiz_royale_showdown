import express from "express";
import http from "http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { pushServiceMock } = vi.hoisted(() => {
  const pushServiceMock = {
    vapidPublicKey: "test-vapid-key",
    saveWebPushSubscription: vi.fn(),
    removeWebPushSubscription: vi.fn(),
    saveFcmToken: vi.fn(),
  };
  return { pushServiceMock };
});

vi.mock("../../services/PushNotificationService", () => ({ pushService: pushServiceMock }));
vi.mock("../../utils/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { errorHandler } from "../../middleware/errorHandler";
import pushRouter from "../push";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/push", pushRouter);
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
  options: { headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      const bodyStr = options.body !== undefined ? JSON.stringify(options.body) : undefined;
      const reqOptions = {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(bodyStr ? { "Content-Length": String(Buffer.byteLength(bodyStr)) } : {}),
          ...(options.headers ?? {}),
        },
      };
      const req = http.request(reqOptions, (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => {
          server.close();
          try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode ?? 0, body: data }); }
        });
      });
      req.on("error", (err) => { server.close(); reject(err); });
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  });
}

const validSubscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
  keys: { p256dh: "test-p256dh-key", auth: "test-auth-key" },
};

describe("GET /push/vapid-public-key", () => {
  it("returns the VAPID public key without authentication", async () => {
    const app = buildApp();
    const res = await request(app, "GET", "/push/vapid-public-key");
    expect(res.status).toBe(200);
    expect((res.body as { key: string }).key).toBe("test-vapid-key");
  });
});

describe("POST /push/subscribe", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/push/subscribe", { body: { subscription: validSubscription } });
    expect(res.status).toBe(401);
  });

  it("saves subscription and returns success for authenticated user", async () => {
    pushServiceMock.saveWebPushSubscription.mockResolvedValue(undefined);
    const token = makeToken("user-1");
    const app = buildApp();
    const res = await request(app, "POST", "/push/subscribe", {
      headers: { Authorization: `Bearer ${token}` },
      body: { subscription: validSubscription },
    });
    expect(res.status).toBe(200);
    expect((res.body as { success: boolean }).success).toBe(true);
    expect(pushServiceMock.saveWebPushSubscription).toHaveBeenCalledWith("user-1", validSubscription);
  });

  it("returns 400 when subscription endpoint is missing", async () => {
    const token = makeToken("user-1");
    const app = buildApp();
    const res = await request(app, "POST", "/push/subscribe", {
      headers: { Authorization: `Bearer ${token}` },
      body: { subscription: { keys: validSubscription.keys } },
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /push/subscribe", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    const app = buildApp();
    const res = await request(app, "DELETE", "/push/subscribe", { body: { subscription: validSubscription } });
    expect(res.status).toBe(401);
  });

  it("removes subscription and returns success for authenticated user", async () => {
    pushServiceMock.removeWebPushSubscription.mockResolvedValue(undefined);
    const token = makeToken("user-1");
    const app = buildApp();
    const res = await request(app, "DELETE", "/push/subscribe", {
      headers: { Authorization: `Bearer ${token}` },
      body: { subscription: validSubscription },
    });
    expect(res.status).toBe(200);
    expect((res.body as { success: boolean }).success).toBe(true);
    expect(pushServiceMock.removeWebPushSubscription).toHaveBeenCalledWith("user-1", validSubscription);
  });
});

describe("POST /push/fcm-token", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/push/fcm-token", { body: { token: "fcm-token-123" } });
    expect(res.status).toBe(401);
  });

  it("saves FCM token and returns success for authenticated user", async () => {
    pushServiceMock.saveFcmToken.mockResolvedValue(undefined);
    const token = makeToken("user-1");
    const app = buildApp();
    const res = await request(app, "POST", "/push/fcm-token", {
      headers: { Authorization: `Bearer ${token}` },
      body: { token: "fcm-device-token-abc" },
    });
    expect(res.status).toBe(200);
    expect((res.body as { success: boolean }).success).toBe(true);
    expect(pushServiceMock.saveFcmToken).toHaveBeenCalledWith("user-1", "fcm-device-token-abc");
  });

  it("returns 400 for empty FCM token string", async () => {
    const token = makeToken("user-1");
    const app = buildApp();
    const res = await request(app, "POST", "/push/fcm-token", {
      headers: { Authorization: `Bearer ${token}` },
      body: { token: "" },
    });
    expect(res.status).toBe(400);
  });
});
