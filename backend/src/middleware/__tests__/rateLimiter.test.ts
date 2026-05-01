import http from "node:http";

import express from "express";
import { describe, expect, it } from "vitest";

import { apiLimiter } from "../rateLimiter";

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

describe("rate limiters", () => {
  it("returns structured 429 responses from the general API limiter", async () => {
    const app = express();
    app.use(apiLimiter);
    app.get("/limited", (_req, res) => res.json({ ok: true }));

    for (let requestNumber = 0; requestNumber < 120; requestNumber += 1) {
      const response = await request(app, "/limited");
      expect(response.status).toBe(200);
    }

    const limited = await request(app, "/limited");

    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({
      error: "Too many requests, please try again later.",
      code: "RATE_LIMITED"
    });
  });
});
