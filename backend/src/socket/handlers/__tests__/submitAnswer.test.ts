import { beforeEach, describe, expect, it, vi } from "vitest";

const redisMock = {
  getJson: vi.fn(),
  setnx: vi.fn(),
  zadd: vi.fn(),
  hset: vi.fn(),
  del: vi.fn()
};

const transactionMock = {
  answer: {
    create: vi.fn(),
  },
  roomPlayer: {
    update: vi.fn(),
  },
};

const prismaMock = {
  round: {
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(async (callback: (tx: typeof transactionMock) => unknown) =>
    callback(transactionMock)
  ),
};

vi.mock("../../../services/RedisService", () => ({
  redisService: redisMock
}));

vi.mock("../../../models/prismaClient", () => ({
  prisma: prismaMock,
}));

function createSocket(roomId?: string) {
  let messageHandler: ((message: unknown) => Promise<void>) | undefined;
  const emit = vi.fn();

  return {
    socket: {
      data: {
        userId: "user-1",
        roomId
      },
      on: vi.fn((event: string, handler: (message: unknown) => Promise<void>) => {
        if (event === "message") {
          messageHandler = handler;
        }
      }),
      emit
    },
    emit,
    dispatch: async (message: unknown) => {
      if (!messageHandler) {
        throw new Error("message handler was not registered");
      }

      await messageHandler(message);
    }
  };
}

describe("registerSubmitAnswerHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.roomPlayer.update.mockResolvedValue({ score: 900 });
    redisMock.zadd.mockResolvedValue(1);
    redisMock.hset.mockResolvedValue(undefined);
  });

  it("rejects answer submissions before the socket joins a room", async () => {
    const { registerSubmitAnswerHandler } = await import("../submitAnswer");
    const { socket, emit, dispatch } = createSocket();

    registerSubmitAnswerHandler({} as never, socket as never);

    await dispatch({
      type: "round:submit_answer",
      version: "v1",
      payload: {
        roomId: "room-1",
        questionId: "question-1",
        answerIndex: 1,
        clientSentAt: new Date().toISOString()
      }
    });

    expect(redisMock.getJson).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith("message", {
      type: "error",
      version: "v1",
      payload: {
        code: "ROOM_NOT_JOINED",
        message: "Socket has not joined a room",
        details: undefined
      }
    });
  });

  it("persists a deterministic score and mirrors it into Redis", async () => {
    vi.setSystemTime(new Date("2026-04-25T12:00:05.000Z"));
    const { registerSubmitAnswerHandler } = await import("../submitAnswer");
    const { socket, emit, dispatch } = createSocket("room-1");

    redisMock.getJson.mockResolvedValue({
      roundId: "round-1",
      questionId: "question-1",
      prompt: "Question?",
      answers: ["A", "B", "C", "D"],
      correctAnswerIndex: 1,
      startTs: new Date("2026-04-25T12:00:00.000Z").getTime(),
      startedAt: "2026-04-25T12:00:00.000Z",
      timeLimitMs: 20_000
    });
    redisMock.setnx.mockResolvedValue(true);

    registerSubmitAnswerHandler({} as never, socket as never);

    await dispatch({
      type: "round:submit_answer",
      version: "v1",
      payload: {
        roomId: "room-1",
        questionId: "question-1",
        answerIndex: 1,
        clientSentAt: "2026-04-25T12:00:04.500Z"
      }
    });

    expect(emit).not.toHaveBeenCalled();
    expect(redisMock.setnx).toHaveBeenCalledWith("answer_lock:room-1:round-1:user-1", "1", 3600);
    expect(transactionMock.answer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        roundId: "round-1",
        userId: "user-1",
        answerIndex: 1,
        isCorrect: true,
        answerTimeMs: 5000,
      }),
    });
    expect(transactionMock.roomPlayer.update).toHaveBeenCalledWith({
      where: { roomId_userId: { roomId: "room-1", userId: "user-1" } },
      data: {
        score: { increment: 900 },
        streak: { increment: 1 },
      },
      select: { score: true },
    });
    expect(redisMock.zadd).toHaveBeenCalledWith("room:room-1:scores", 900, "user-1");
    expect(redisMock.hset).toHaveBeenCalledWith(
      "room:room-1:round:round-1:answers",
      "user-1",
      JSON.stringify({
        answerIndex: 1,
        clientSentAt: "2026-04-25T12:00:04.500Z",
        isCorrect: true,
        scoreDelta: 900,
        submittedAt: "2026-04-25T12:00:05.000Z"
      })
    );

    vi.useRealTimers();
  });
});
