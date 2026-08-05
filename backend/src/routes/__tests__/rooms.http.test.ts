import http from "node:http";

import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VALID_ROOM_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const VALID_ROOM_CODE = "ABCD23";

const roomServiceMock = vi.hoisted(() => ({
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
  getRoomByCode: vi.fn(),
  getRoomById: vi.fn(),
  recoverStaleCountdown: vi.fn(),
  resetStartFailure: vi.fn(),
  startGame: vi.fn(),
  leaveRoom: vi.fn(),
}));

const gameOrchestratorMock = vi.hoisted(() => ({
  hasActiveGame: vi.fn(),
  assertQuestionBankReady: vi.fn(),
  startGame: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  roomPlayer: {
    findMany: vi.fn(),
  },
}));

vi.mock("../../middleware/auth", () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction) => {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith("Bearer test-user:")) {
      res.status(401).json({
        error: "Missing or malformed Authorization header",
        code: "UNAUTHORIZED",
      });
      return;
    }

    req.jwtClaims = {
      sub: authorization.slice("Bearer test-user:".length),
      email: "player@example.com",
      displayName: "Player",
      iat: 0,
      exp: 9999999999,
    };
    next();
  },
}));

vi.mock("../../services/RoomService", () => ({
  roomService: roomServiceMock,
}));

vi.mock("../../services/GameOrchestrator", () => ({
  gameOrchestrator: gameOrchestratorMock,
}));

vi.mock("../../models/prismaClient", () => ({
  prisma: prismaMock,
}));

vi.mock("../../socket", () => ({
  getIo: vi.fn(() => ({})),
}));

interface TestResponse {
  status: number;
  body: unknown;
}

interface RequestOptions {
  authUserId?: string | null;
  body?: unknown;
}

async function request(
  app: Express,
  method: string,
  path: string,
  options: RequestOptions = {}
): Promise<TestResponse> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a port");
  }

  try {
    const authUserId = options.authUserId === undefined ? "host-user" : options.authUserId;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authUserId) {
      headers.Authorization = `Bearer test-user:${authUserId}`;
    }

    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();

    return {
      status: response.status,
      body: text ? (JSON.parse(text) as unknown) : null,
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function createRoomsTestApp(): Promise<Express> {
  const { roomsRouter } = await import("../rooms");
  const { errorHandler } = await import("../../middleware/errorHandler");
  const app = express();

  app.use(express.json());
  app.use("/api/v1/rooms", roomsRouter);
  app.use(errorHandler);

  return app;
}

describe("room routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gameOrchestratorMock.hasActiveGame.mockReturnValue(false);
    gameOrchestratorMock.assertQuestionBankReady.mockResolvedValue(undefined);
    gameOrchestratorMock.startGame.mockResolvedValue(undefined);
    prismaMock.roomPlayer.findMany.mockResolvedValue([{ userId: "host-user" }]);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("requires authentication for room code lookups", async () => {
    const app = await createRoomsTestApp();

    const response = await request(app, "GET", `/api/v1/rooms/${VALID_ROOM_CODE}`, {
      authUserId: null,
    });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: "Missing or malformed Authorization header",
      code: "UNAUTHORIZED",
    });
    expect(roomServiceMock.getRoomByCode).not.toHaveBeenCalled();
  });

  it("redacts room lookup metadata for authenticated users outside the room", async () => {
    roomServiceMock.getRoomByCode.mockResolvedValue({
      room: {
        roomId: VALID_ROOM_ID,
        code: VALID_ROOM_CODE,
        phase: "WAITING",
        roundNumber: 0,
        totalRounds: 10,
        players: [
          {
            id: "host-user",
            displayName: "Host",
            score: 0,
            streak: 0,
            isEliminated: false,
          },
        ],
      },
      hostUserId: "host-user",
      config: { isPrivate: true, maxPlayers: 8 },
      createdAt: "2026-04-25T12:00:00.000Z",
      startedAt: null,
    });
    const app = await createRoomsTestApp();

    const response = await request(app, "GET", `/api/v1/rooms/${VALID_ROOM_CODE}`, {
      authUserId: "other-user",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      roomCode: VALID_ROOM_CODE,
      room: {
        code: VALID_ROOM_CODE,
        phase: "WAITING",
        playerCount: 1,
      },
      config: {
        maxPlayers: 8,
      },
    });
    expect(roomServiceMock.getRoomByCode).toHaveBeenCalledWith(VALID_ROOM_CODE);
  });

  it("returns full room lookup metadata to existing room participants", async () => {
    roomServiceMock.getRoomByCode.mockResolvedValue({
      room: {
        roomId: VALID_ROOM_ID,
        code: VALID_ROOM_CODE,
        phase: "WAITING",
        roundNumber: 0,
        totalRounds: 10,
        players: [
          {
            id: "host-user",
            displayName: "Host",
            score: 0,
            streak: 0,
            isEliminated: false,
          },
        ],
      },
      hostUserId: "host-user",
      config: { isPrivate: true, maxPlayers: 8 },
      createdAt: "2026-04-25T12:00:00.000Z",
      startedAt: null,
    });
    const app = await createRoomsTestApp();

    const response = await request(app, "GET", `/api/v1/rooms/${VALID_ROOM_CODE}`, {
      authUserId: "host-user",
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      roomId: VALID_ROOM_ID,
      roomCode: VALID_ROOM_CODE,
      hostUserId: "host-user",
      room: {
        roomId: VALID_ROOM_ID,
        code: VALID_ROOM_CODE,
        players: [
          {
            id: "host-user",
            displayName: "Host",
          },
        ],
      },
    });
  });

  it("returns structured 400 validation errors for invalid start room ids", async () => {
    const app = await createRoomsTestApp();

    const response = await request(app, "POST", "/api/v1/rooms/not-a-ulid/start");

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
    });
    expect(roomServiceMock.startGame).not.toHaveBeenCalled();
  });

  it("preserves room start failure status codes from the room service", async () => {
    const { BadRequestError } = await import("../../utils/errors");
    roomServiceMock.recoverStaleCountdown.mockResolvedValue(false);
    roomServiceMock.startGame.mockRejectedValue(
      new BadRequestError("At least 2 players are required to start")
    );
    const app = await createRoomsTestApp();

    const response = await request(app, "POST", `/api/v1/rooms/${VALID_ROOM_ID}/start`);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "At least 2 players are required to start",
      code: "BAD_REQUEST",
    });
  });

  it("passes the solo start flag to the room service", async () => {
    roomServiceMock.recoverStaleCountdown.mockResolvedValue(false);
    roomServiceMock.startGame.mockResolvedValue({
      room: {
        roomId: VALID_ROOM_ID,
        code: VALID_ROOM_CODE,
        phase: "COUNTDOWN",
        roundNumber: 0,
        totalRounds: 10,
        players: [
          {
            id: "host-user",
            displayName: "Host",
            score: 0,
            streak: 0,
            isEliminated: false,
          },
        ],
      },
      hostUserId: "host-user",
      config: { isPrivate: true, maxPlayers: 8 },
      createdAt: "2026-04-25T12:00:00.000Z",
      startedAt: "2026-04-25T12:00:00.000Z",
    });
    const app = await createRoomsTestApp();

    const response = await request(app, "POST", `/api/v1/rooms/${VALID_ROOM_ID}/start`, {
      body: { allowSolo: true },
    });

    expect(response.status).toBe(200);
    expect(roomServiceMock.startGame).toHaveBeenCalledWith(VALID_ROOM_ID, "host-user", {
      allowSolo: true,
    });
  });

  it("returns 500 and resets countdown state when question-bank readiness fails", async () => {
    roomServiceMock.recoverStaleCountdown.mockResolvedValue(false);
    roomServiceMock.startGame.mockResolvedValue({
      room: {
        roomId: VALID_ROOM_ID,
        code: VALID_ROOM_CODE,
        phase: "COUNTDOWN",
        roundNumber: 0,
        totalRounds: 10,
        players: [],
      },
      hostUserId: "host-user",
      config: { isPrivate: true, maxPlayers: 8 },
      createdAt: "2026-04-25T12:00:00.000Z",
      startedAt: "2026-04-25T12:00:00.000Z",
    });
    gameOrchestratorMock.assertQuestionBankReady.mockRejectedValue(
      new Error("Question bank is empty")
    );
    const app = await createRoomsTestApp();

    const response = await request(app, "POST", `/api/v1/rooms/${VALID_ROOM_ID}/start`);

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      error: "Question bank is empty",
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(roomServiceMock.resetStartFailure).toHaveBeenCalledWith(
      VALID_ROOM_ID,
      "Question bank is empty"
    );
  });
});
