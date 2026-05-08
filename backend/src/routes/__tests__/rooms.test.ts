/**
 * Tests for the /rooms router.
 *
 * Critical paths:
 *  - POST / and POST /join and POST /:roomId/leave require authentication
 *  - GET /:roomCode (public) returns 404 for unknown rooms
 *  - GET /join/:inviteCode (public) returns 404 for unknown invite codes
 *  - POST /:roomId/invite returns 401 for non-host users
 *  - POST / returns 201 with room payload on success
 */

import express from "express";
import http from "http";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { prismaMock, roomServiceMock, gameOrchestratorMock } = vi.hoisted(() => {
  const prismaMock = {
    room: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    roomPlayer: {
      findMany: vi.fn(),
    },
  };

  const roomLifecycleStub = {
    room: { roomId: "room-1", code: "ABC123", players: [] },
    hostUserId: "user-1",
    config: { isPrivate: true, maxPlayers: 8 },
    createdAt: new Date(),
    startedAt: null,
  };

  const roomServiceMock = {
    createRoom: vi.fn(async () => roomLifecycleStub),
    joinRoom: vi.fn(async () => ({ room: { id: "room-1", code: "ABC123" }, wsToken: "ws-token" })),
    getRoomById: vi.fn(async () => roomLifecycleStub),
    getRoomByCode: vi.fn(async () => roomLifecycleStub),
    startGame: vi.fn(async () => roomLifecycleStub),
    leaveRoom: vi.fn(async () => ({
      left: true,
      roomId: "room-1",
      room: null,
      roomClosed: false,
      hostUserId: null,
      config: null,
      createdAt: new Date(),
      startedAt: null,
    })),
    recoverStaleCountdown: vi.fn(),
    resetStartFailure: vi.fn(),
    waitForPlayersOrFillBots: vi.fn(async () => ["user-1"]),
  };

  const gameOrchestratorMock = {
    hasActiveGame: vi.fn(() => false),
    startGame: vi.fn(async () => undefined),
    assertQuestionBankReady: vi.fn(async () => undefined),
    resetStartFailure: vi.fn(async () => undefined),
  };

  return { prismaMock, roomServiceMock, gameOrchestratorMock };
});

vi.mock("../../models/prismaClient", () => ({ prisma: prismaMock }));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../services/RoomService", () => ({
  roomService: roomServiceMock,
}));
vi.mock("../../services/GameOrchestrator", () => ({
  gameOrchestrator: gameOrchestratorMock,
}));
vi.mock("../../socket", () => ({ getIo: vi.fn(() => ({})) }));

import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { NotFoundError } from "../../utils/errors";
import { errorHandler } from "../../middleware/errorHandler";
import { roomsRouter } from "../rooms";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/rooms", roomsRouter);
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

describe("POST /rooms — create room", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/rooms", { body: {} });
    expect(res.status).toBe(401);
  });

  it("returns 201 with room payload on success", async () => {
    const token = makeToken("user-1");
    const app = buildApp();
    const res = await request(app, "POST", "/rooms", {
      headers: { Authorization: `Bearer ${token}` },
      body: { isPrivate: false, maxPlayers: 4 },
    });

    expect(res.status).toBe(201);
    const body = res.body as { roomId: string; roomCode: string };
    expect(body.roomId).toBe("room-1");
    expect(body.roomCode).toBe("ABC123");
    expect(roomServiceMock.createRoom).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ isPrivate: false, maxPlayers: 4 }),
    );
  });
});

describe("POST /rooms/join — join room", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/rooms/join", { body: { roomCode: "ABC123" } });
    expect(res.status).toBe(401);
  });

  it("returns 200 with room payload when join succeeds", async () => {
    const token = makeToken("user-1");
    const app = buildApp();
    const res = await request(app, "POST", "/rooms/join", {
      headers: { Authorization: `Bearer ${token}` },
      body: { roomCode: "abc123" },
    });

    expect(res.status).toBe(200);
    expect(roomServiceMock.joinRoom).toHaveBeenCalledWith("user-1", "ABC123");
  });
});

describe("GET /rooms/:roomCode — get room by code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with room data (no auth required)", async () => {
    const app = buildApp();
    const res = await request(app, "GET", "/rooms/ABC123");

    expect(res.status).toBe(200);
    const body = res.body as { roomId: string };
    expect(body.roomId).toBe("room-1");
  });

  it("returns 404 for unknown room code", async () => {
    roomServiceMock.getRoomByCode.mockRejectedValueOnce(new NotFoundError("Room not found"));

    const app = buildApp();
    const res = await request(app, "GET", "/rooms/XXXXXX");

    expect(res.status).toBe(404);
  });
});

describe("GET /rooms/join/:inviteCode — look up by invite code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with roomId and playerCount for a valid invite code", async () => {
    prismaMock.room.findFirst.mockResolvedValue({
      id: "room-1",
      code: "ABC123",
      players: [{ id: "p1" }, { id: "p2" }],
    });

    const app = buildApp();
    const res = await request(app, "GET", "/rooms/join/DEADBEEF");

    expect(res.status).toBe(200);
    const body = res.body as { roomId: string; playerCount: number };
    expect(body.roomId).toBe("room-1");
    expect(body.playerCount).toBe(2);
  });

  it("returns 404 when no room matches the invite code", async () => {
    prismaMock.room.findFirst.mockResolvedValue(null);

    const app = buildApp();
    const res = await request(app, "GET", "/rooms/join/INVALID");

    expect(res.status).toBe(404);
  });
});

describe("POST /rooms/:roomId/invite — generate invite code", () => {
  const VALID_ULID = "01HN9QXYZ1234567890ABCDEF1";

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.room.update.mockResolvedValue({});
  });

  it("returns 401 when unauthenticated", async () => {
    const app = buildApp();
    const res = await request(app, "POST", `/rooms/${VALID_ULID}/invite`);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the room does not exist", async () => {
    prismaMock.room.findUnique.mockResolvedValue(null);

    const token = makeToken("user-1");
    const app = buildApp();
    const res = await request(app, "POST", `/rooms/${VALID_ULID}/invite`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
  });

  it("returns 401 when the requester is not the room host", async () => {
    prismaMock.room.findUnique.mockResolvedValue({ hostUserId: "other-user" });

    const token = makeToken("user-1");
    const app = buildApp();
    const res = await request(app, "POST", `/rooms/${VALID_ULID}/invite`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(401);
  });

  it("returns 200 with a 6-character inviteCode for the host", async () => {
    prismaMock.room.findUnique.mockResolvedValue({ hostUserId: "user-1" });

    const token = makeToken("user-1");
    const app = buildApp();
    const res = await request(app, "POST", `/rooms/${VALID_ULID}/invite`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as { inviteCode: string };
    expect(body.inviteCode).toHaveLength(6);
    expect(prismaMock.room.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: VALID_ULID } }),
    );
  });
});

describe("POST /rooms/:roomId/leave — leave room", () => {
  const VALID_ULID = "01HN9QXYZ1234567890ABCDEF1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const app = buildApp();
    const res = await request(app, "POST", `/rooms/${VALID_ULID}/leave`);
    expect(res.status).toBe(401);
  });

  it("returns 200 with left:true on success", async () => {
    const token = makeToken("user-1");
    const app = buildApp();
    const res = await request(app, "POST", `/rooms/${VALID_ULID}/leave`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as { left: boolean };
    expect(body.left).toBe(true);
    expect(roomServiceMock.leaveRoom).toHaveBeenCalledWith(VALID_ULID, "user-1");
  });
});

describe("POST /rooms/:roomId/start — start game", () => {
  const VALID_ULID = "01HN9QXYZ1234567890ABCDEF1";

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.roomPlayer.findMany.mockResolvedValue([{ userId: "user-1" }]);
  });

  it("returns 401 when unauthenticated", async () => {
    const app = buildApp();
    const res = await request(app, "POST", `/rooms/${VALID_ULID}/start`);
    expect(res.status).toBe(401);
  });

  it("returns 200 with room payload and invokes startup chain", async () => {
    const token = makeToken("user-1");
    const app = buildApp();
    const res = await request(app, "POST", `/rooms/${VALID_ULID}/start`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as { roomId: string };
    expect(body.roomId).toBe("room-1");
    expect(roomServiceMock.recoverStaleCountdown).toHaveBeenCalledWith(VALID_ULID, false);
    expect(roomServiceMock.startGame).toHaveBeenCalledWith(VALID_ULID, "user-1");
    expect(gameOrchestratorMock.assertQuestionBankReady).toHaveBeenCalledTimes(1);
  });

  it("calls roomService.resetStartFailure and returns 500 when assertQuestionBankReady throws", async () => {
    gameOrchestratorMock.assertQuestionBankReady.mockRejectedValueOnce(
      new Error("Question bank empty"),
    );

    const token = makeToken("user-1");
    const app = buildApp();
    const res = await request(app, "POST", `/rooms/${VALID_ULID}/start`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(500);
    expect(roomServiceMock.resetStartFailure).toHaveBeenCalledWith(
      VALID_ULID,
      "Question bank empty",
    );
  });
});
