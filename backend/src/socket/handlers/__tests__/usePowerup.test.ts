import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "socket.io";
import type { AuthenticatedSocket } from "../../middleware";

const mocks = vi.hoisted(() => ({
  activatePowerUp: vi.fn(),
  redisGetJson: vi.fn(),
  roomPlayerFindUnique: vi.fn(),
}));

vi.mock("../../../services/PowerUpService", () => ({
  powerUpService: { activatePowerUp: mocks.activatePowerUp },
}));
vi.mock("../../../services/RedisService", () => ({
  redisService: { getJson: mocks.redisGetJson },
}));
vi.mock("../../../models/prismaClient", () => ({
  prisma: {
    roomPlayer: {
      findUnique: mocks.roomPlayerFindUnique,
    },
  },
}));
vi.mock("../../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function createSocket(socketData: { userId: string; roomId?: string } = { userId: "user-1" }) {
  let messageHandler: ((message: unknown) => Promise<void>) | undefined;
  const emit = vi.fn();
  return {
    socket: {
      data: socketData,
      emit,
      on: vi.fn((event: string, handler: (message: unknown) => Promise<void>) => {
        if (event === "message") messageHandler = handler;
      }),
    } as unknown as AuthenticatedSocket,
    emit,
    dispatch: async (message: unknown) => {
      if (!messageHandler) throw new Error("message handler not registered");
      await messageHandler(message);
    },
  };
}

function createIo() {
  const roomEmit = vi.fn();
  const io = {
    to: vi.fn(() => ({ emit: roomEmit })),
    _roomEmit: roomEmit,
  } as unknown as Server & { _roomEmit: ReturnType<typeof vi.fn> };
  return io;
}

const validActivate = {
  type: "powerup:activate",
  payload: { roomId: "room-1", powerUpId: "pu-1" },
};

describe("registerUsePowerupHandler", () => {
  let { socket, emit, dispatch } = createSocket();
  let io: ReturnType<typeof createIo>;

  beforeEach(() => {
    vi.clearAllMocks();
    ({ socket, emit, dispatch } = createSocket({ userId: "user-1", roomId: "room-1" }));
    io = createIo();
    mocks.redisGetJson.mockResolvedValue(null);
    mocks.roomPlayerFindUnique.mockResolvedValue({ isEliminated: false });
  });

  it("registers a message handler on the socket", async () => {
    const { registerUsePowerupHandler } = await import("../usePowerup");
    registerUsePowerupHandler(io as Server, socket);
    expect((socket as unknown as { on: ReturnType<typeof vi.fn> }).on).toHaveBeenCalledWith(
      "message",
      expect.any(Function),
    );
  });

  it("ignores messages that are not powerup:activate", async () => {
    const { registerUsePowerupHandler } = await import("../usePowerup");
    registerUsePowerupHandler(io as Server, socket);
    await dispatch({ type: "room:join", payload: {} });
    expect(mocks.activatePowerUp).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("emits VALIDATION_ERROR for missing roomId and powerUpId", async () => {
    const { registerUsePowerupHandler } = await import("../usePowerup");
    registerUsePowerupHandler(io as Server, socket);
    await dispatch({ type: "powerup:activate", payload: {} });
    expect(emit).toHaveBeenCalledWith(
      "message",
      expect.objectContaining({
        type: "error",
        version: "v1",
        payload: expect.objectContaining({ code: "VALIDATION_ERROR" }),
      }),
    );
  });

  it("emits ROOM_MISMATCH when socket roomId does not match payload roomId", async () => {
    const { socket: s, emit: e, dispatch: d } = createSocket({ userId: "user-1", roomId: "room-99" });
    const { registerUsePowerupHandler } = await import("../usePowerup");
    registerUsePowerupHandler(io as Server, s);
    await d(validActivate);
    expect(e).toHaveBeenCalledWith(
      "message",
      expect.objectContaining({
        payload: expect.objectContaining({ code: "ROOM_MISMATCH" }),
      }),
    );
    expect(mocks.activatePowerUp).not.toHaveBeenCalled();
  });

  it("emits ROOM_NOT_JOINED when the socket has not joined a room", async () => {
    const { socket: s, emit: e, dispatch: d } = createSocket({ userId: "user-1" });
    const { registerUsePowerupHandler } = await import("../usePowerup");
    registerUsePowerupHandler(io as Server, s);
    await d(validActivate);
    expect(e).toHaveBeenCalledWith(
      "message",
      expect.objectContaining({
        payload: expect.objectContaining({ code: "ROOM_NOT_JOINED" }),
      }),
    );
    expect(mocks.activatePowerUp).not.toHaveBeenCalled();
  });

  it("broadcasts public effect to room on successful activation", async () => {
    mocks.activatePowerUp.mockResolvedValue({
      code: "SHIELD",
      publicEffect: { type: "SHIELD", affectedPlayerIds: ["user-1"] },
      privateEffect: null,
    });
    const { registerUsePowerupHandler } = await import("../usePowerup");
    registerUsePowerupHandler(io as Server, socket);
    await dispatch(validActivate);

    expect((io as unknown as { to: ReturnType<typeof vi.fn> }).to).toHaveBeenCalledWith("room-1");
    expect((io as unknown as { _roomEmit: ReturnType<typeof vi.fn> })._roomEmit).toHaveBeenCalledWith("message", {
      type: "powerup:effect",
      version: "v1",
      payload: { type: "SHIELD", affectedPlayerIds: ["user-1"] },
    });
    expect(emit).not.toHaveBeenCalled();
  });

  it("emits ELIMINATED when the room player is eliminated", async () => {
    mocks.roomPlayerFindUnique.mockResolvedValue({ isEliminated: true });
    const { registerUsePowerupHandler } = await import("../usePowerup");
    registerUsePowerupHandler(io as Server, socket);
    await dispatch(validActivate);

    expect(emit).toHaveBeenCalledWith(
      "message",
      expect.objectContaining({
        payload: expect.objectContaining({ code: "ELIMINATED" }),
      }),
    );
    expect(mocks.activatePowerUp).not.toHaveBeenCalled();
  });

  it("sends private effect to activating socket when result includes one", async () => {
    mocks.activatePowerUp.mockResolvedValue({
      code: "FIFTY_FIFTY",
      publicEffect: { type: "FIFTY_FIFTY" },
      privateEffect: { maskedAnswerIndices: [1, 3] },
    });
    const { registerUsePowerupHandler } = await import("../usePowerup");
    registerUsePowerupHandler(io as Server, socket);
    await dispatch(validActivate);

    expect(emit).toHaveBeenCalledWith("message", {
      type: "powerup:effect_private",
      version: "v1",
      payload: { maskedAnswerIndices: [1, 3] },
    });
  });

  it("passes correctAnswerIndex from Redis to PowerUpService when available", async () => {
    mocks.redisGetJson.mockResolvedValue({ correctAnswerIndex: 2 });
    mocks.activatePowerUp.mockResolvedValue({
      code: "FIFTY_FIFTY",
      publicEffect: { type: "FIFTY_FIFTY" },
      privateEffect: null,
    });
    const { registerUsePowerupHandler } = await import("../usePowerup");
    registerUsePowerupHandler(io as Server, socket);
    await dispatch(validActivate);

    expect(mocks.activatePowerUp).toHaveBeenCalledWith(
      expect.objectContaining({ correctAnswerIndex: 2 }),
      io,
    );
  });

  it("emits POWERUP_ALREADY_USED on already-used ForbiddenError from PowerUpService", async () => {
    const { ForbiddenError } = await import("../../../utils/errors");
    mocks.activatePowerUp.mockRejectedValue(new ForbiddenError("Power-up already used this round"));
    const { registerUsePowerupHandler } = await import("../usePowerup");
    registerUsePowerupHandler(io as Server, socket);
    await dispatch(validActivate);

    expect(emit).toHaveBeenCalledWith(
      "message",
      expect.objectContaining({
        payload: expect.objectContaining({
          code: "POWERUP_ALREADY_USED",
          message: "Power-up already used this round",
        }),
      }),
    );
  });

  it("emits POWERUP_NOT_FOUND on NotFoundError from PowerUpService", async () => {
    const { NotFoundError } = await import("../../../utils/errors");
    mocks.activatePowerUp.mockRejectedValue(new NotFoundError("Power-up not found in inventory"));
    const { registerUsePowerupHandler } = await import("../usePowerup");
    registerUsePowerupHandler(io as Server, socket);
    await dispatch(validActivate);

    expect(emit).toHaveBeenCalledWith(
      "message",
      expect.objectContaining({
        payload: expect.objectContaining({ code: "POWERUP_NOT_FOUND" }),
      }),
    );
  });

  it("emits INTERNAL_ERROR on unexpected error from PowerUpService", async () => {
    mocks.activatePowerUp.mockRejectedValue(new Error("DB connection dropped"));
    const { registerUsePowerupHandler } = await import("../usePowerup");
    registerUsePowerupHandler(io as Server, socket);
    await dispatch(validActivate);

    expect(emit).toHaveBeenCalledWith(
      "message",
      expect.objectContaining({
        payload: expect.objectContaining({ code: "INTERNAL_ERROR" }),
      }),
    );
  });
});
