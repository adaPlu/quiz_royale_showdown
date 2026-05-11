import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, NotFoundError } from "../../../utils/errors";

const { powerUpServiceMock, redisMock, loggerMock } = vi.hoisted(() => ({
  powerUpServiceMock: {
    activatePowerUp: vi.fn(),
  },
  redisMock: {
    getJson: vi.fn(),
  },
  loggerMock: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../../services/PowerUpService", () => ({
  powerUpService: powerUpServiceMock,
}));
vi.mock("../../../services/RedisService", () => ({
  redisService: redisMock,
}));
vi.mock("../../../utils/logger", () => ({
  logger: loggerMock,
}));

function createSocket(roomId?: string) {
  let messageHandler: ((message: unknown) => Promise<void>) | undefined;
  const emit = vi.fn();

  return {
    socket: {
      data: {
        userId: "user-1",
        roomId,
      },
      on: vi.fn((event: string, handler: (message: unknown) => Promise<void>) => {
        if (event === "message") {
          messageHandler = handler;
        }
      }),
      emit,
    },
    emit,
    dispatch: async (message: unknown) => {
      if (!messageHandler) {
        throw new Error("message handler was not registered");
      }

      await messageHandler(message);
    },
  };
}

function createIo() {
  const roomEmit = vi.fn();
  const to = vi.fn(() => ({ emit: roomEmit }));

  return {
    io: { to },
    to,
    roomEmit,
  };
}

describe("registerUsePowerupHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.getJson.mockResolvedValue(null);
  });

  it("activates through PowerUpService using a code-compatible payload and emits the public effect", async () => {
    const { registerUsePowerupHandler } = await import("../usePowerup");
    const { io, to, roomEmit } = createIo();
    const { socket, emit, dispatch } = createSocket("room-1");

    powerUpServiceMock.activatePowerUp.mockResolvedValue({
      roomId: "room-1",
      userId: "user-1",
      powerUpId: "double-down-id",
      code: "DOUBLE_DOWN",
      publicEffect: { type: "DOUBLE_DOWN", targetPlayerId: "user-1" },
    });

    registerUsePowerupHandler(io as never, socket as never);

    await dispatch({
      type: "powerup:activate",
      version: "v1",
      payload: {
        roomId: "room-1",
        code: "DOUBLE_DOWN",
      },
    });

    expect(powerUpServiceMock.activatePowerUp).toHaveBeenCalledWith(
      {
        roomId: "room-1",
        userId: "user-1",
        powerUpId: "DOUBLE_DOWN",
        targetPlayerId: undefined,
        roundId: undefined,
        questionOptions: undefined,
        correctAnswerIndex: undefined,
      },
      io,
    );
    expect(to).toHaveBeenCalledWith("room-1");
    expect(roomEmit).toHaveBeenCalledWith("message", {
      type: "powerup:activated",
      version: "v1",
      payload: {
        roomId: "room-1",
        userId: "user-1",
        powerUpId: "double-down-id",
        code: "DOUBLE_DOWN",
        effect: { type: "DOUBLE_DOWN", targetPlayerId: "user-1" },
      },
    });
    expect(emit).not.toHaveBeenCalled();
  });

  it("passes active question context and emits private effects only to the activating socket", async () => {
    const { registerUsePowerupHandler } = await import("../usePowerup");
    const { io, roomEmit } = createIo();
    const { socket, emit, dispatch } = createSocket("room-1");

    redisMock.getJson.mockResolvedValue({
      roundId: "round-1",
      answers: ["A", "B", "C", "D"],
      correctAnswerIndex: 2,
    });
    powerUpServiceMock.activatePowerUp.mockResolvedValue({
      roomId: "room-1",
      userId: "user-1",
      powerUpId: "fifty-fifty-id",
      code: "FIFTY_FIFTY",
      publicEffect: { type: "FIFTY_FIFTY", targetPlayerId: "user-1" },
      privateEffect: { type: "FIFTY_FIFTY", maskedAnswerIndices: [0, 1] },
    });

    registerUsePowerupHandler(io as never, socket as never);

    await dispatch({
      type: "powerup:activate",
      payload: {
        roomId: "room-1",
        powerUpId: "fifty-fifty-id",
      },
    });

    expect(redisMock.getJson).toHaveBeenCalledWith("game:room-1:current_question");
    expect(powerUpServiceMock.activatePowerUp).toHaveBeenCalledWith(
      expect.objectContaining({
        roundId: "round-1",
        questionOptions: ["A", "B", "C", "D"],
        correctAnswerIndex: 2,
      }),
      io,
    );
    expect(roomEmit).toHaveBeenCalledWith(
      "message",
      expect.objectContaining({ type: "powerup:activated" }),
    );
    expect(emit).toHaveBeenCalledWith("message", {
      type: "powerup:private_effect",
      version: "v1",
      payload: {
        roomId: "room-1",
        powerUpId: "fifty-fifty-id",
        code: "FIFTY_FIFTY",
        effect: { type: "FIFTY_FIFTY", maskedAnswerIndices: [0, 1] },
      },
    });
  });

  it("rejects activation before the socket joins a room", async () => {
    const { registerUsePowerupHandler } = await import("../usePowerup");
    const { io } = createIo();
    const { socket, emit, dispatch } = createSocket();

    registerUsePowerupHandler(io as never, socket as never);

    await dispatch({
      type: "powerup:activate",
      payload: {
        roomId: "room-1",
        powerUpId: "double-down-id",
      },
    });

    expect(powerUpServiceMock.activatePowerUp).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith("message", {
      type: "error",
      version: "v1",
      payload: {
        code: "ROOM_NOT_JOINED",
        message: "Socket has not joined a room",
        details: undefined,
      },
    });
  });

  it("maps canonical service failures to socket error codes", async () => {
    const { registerUsePowerupHandler } = await import("../usePowerup");
    const { io } = createIo();
    const { socket, emit, dispatch } = createSocket("room-1");

    powerUpServiceMock.activatePowerUp.mockRejectedValueOnce(new ForbiddenError("Power-up already used in this room"));
    powerUpServiceMock.activatePowerUp.mockRejectedValueOnce(new NotFoundError("Power-up not found"));

    registerUsePowerupHandler(io as never, socket as never);

    await dispatch({
      type: "powerup:activate",
      payload: { roomId: "room-1", id: "double-down-id" },
    });
    await dispatch({
      type: "powerup:activate",
      payload: { roomId: "room-1", id: "missing-id" },
    });

    expect(emit).toHaveBeenNthCalledWith(1, "message", {
      type: "error",
      version: "v1",
      payload: {
        code: "POWERUP_ALREADY_USED",
        message: "Power-up already used in this room",
        details: undefined,
      },
    });
    expect(emit).toHaveBeenNthCalledWith(2, "message", {
      type: "error",
      version: "v1",
      payload: {
        code: "POWERUP_NOT_FOUND",
        message: "Power-up not found",
        details: undefined,
      },
    });
  });
});
