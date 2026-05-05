import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RoomSnapshot } from "../../../types/contracts";
import type { AuthenticatedSocket } from "../../middleware";

const mocks = vi.hoisted(() => ({
  buildRoomSnapshot: vi.fn(),
  roundFindFirst: vi.fn(),
  redisGetJson: vi.fn()
}));

vi.mock("../../../models/prismaClient", () => ({
  prisma: {
    round: {
      findFirst: mocks.roundFindFirst
    }
  }
}));

vi.mock("../../../services/RedisService", () => ({
  redisService: {
    getJson: mocks.redisGetJson
  }
}));

vi.mock("../playerReady", () => ({
  buildRoomSnapshot: mocks.buildRoomSnapshot
}));

function createSocket() {
  return {
    emit: vi.fn()
  } as unknown as AuthenticatedSocket & { emit: ReturnType<typeof vi.fn> };
}

function roomSnapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    roomId: "room-1",
    code: "ABCD12",
    hostId: "user-1",
    phase: "WAITING",
    roundNumber: 0,
    totalRounds: 10,
    players: [
      {
        id: "user-1",
        displayName: "Ada",
        score: 0,
        streak: 0,
        isEliminated: false
      }
    ],
    ...overrides
  };
}

describe("syncRoomState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redisGetJson.mockResolvedValue(null);
    mocks.roundFindFirst.mockResolvedValue(null);
  });

  it("resyncs lobby state with a room snapshot only", async () => {
    const { syncRoomState } = await import("../reconnect");
    const socket = createSocket();
    mocks.buildRoomSnapshot.mockResolvedValue(roomSnapshot());

    await syncRoomState(socket, "room-1");

    expect(socket.emit).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenCalledWith("message", {
      type: "room:state_sync",
      version: "v1",
      payload: { room: roomSnapshot() }
    });
    expect(mocks.redisGetJson).toHaveBeenCalledWith("game:room-1:current_question");
    expect(mocks.roundFindFirst).toHaveBeenCalledWith({
      where: { roomId: "room-1", lockedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      select: { id: true, lockedAt: true }
    });
  });

  it("replays the active question after the room snapshot", async () => {
    const { syncRoomState } = await import("../reconnect");
    const socket = createSocket();
    mocks.buildRoomSnapshot.mockResolvedValue(roomSnapshot({ phase: "QUESTION_ACTIVE", roundNumber: 3 }));
    mocks.redisGetJson.mockResolvedValue({
      roundId: "round-3",
      questionId: "question-3",
      prompt: "What is 2 + 2?",
      answers: ["1", "2", "3", "4"],
      timeLimitMs: 10000,
      startedAt: "2026-04-25T12:00:00.000Z"
    });

    await syncRoomState(socket, "room-1");

    expect(socket.emit).toHaveBeenCalledTimes(2);
    expect(socket.emit).toHaveBeenNthCalledWith(
      1,
      "message",
      expect.objectContaining({ type: "room:state_sync" })
    );
    expect(socket.emit).toHaveBeenNthCalledWith(2, "message", {
      type: "round:question_started",
      version: "v1",
      payload: {
        roomId: "room-1",
        roundId: "round-3",
        questionId: "question-3",
        prompt: "What is 2 + 2?",
        answers: ["1", "2", "3", "4"],
        timeLimitMs: 10000,
        startedAt: "2026-04-25T12:00:00.000Z"
      }
    });
  });

  it("replays the answer lock for a non-active room with a locked round", async () => {
    const { syncRoomState } = await import("../reconnect");
    const socket = createSocket();
    mocks.buildRoomSnapshot.mockResolvedValue(roomSnapshot({ phase: "ANSWER_LOCKED", roundNumber: 3 }));
    mocks.roundFindFirst.mockResolvedValue({
      id: "round-3",
      lockedAt: new Date("2026-04-25T12:00:10.000Z")
    });

    await syncRoomState(socket, "room-1");

    expect(socket.emit).toHaveBeenCalledTimes(2);
    expect(socket.emit).toHaveBeenNthCalledWith(
      1,
      "message",
      expect.objectContaining({ type: "room:state_sync" })
    );
    expect(socket.emit).toHaveBeenNthCalledWith(2, "message", {
      type: "round:answer_locked",
      version: "v1",
      payload: {
        roomId: "room-1",
        roundId: "round-3",
        lockedAt: "2026-04-25T12:00:10.000Z"
      }
    });
  });

  it("does not emit when the room no longer exists", async () => {
    const { syncRoomState } = await import("../reconnect");
    const socket = createSocket();
    mocks.buildRoomSnapshot.mockResolvedValue(null);

    await syncRoomState(socket, "missing-room");

    expect(socket.emit).not.toHaveBeenCalled();
    expect(mocks.redisGetJson).not.toHaveBeenCalled();
    expect(mocks.roundFindFirst).not.toHaveBeenCalled();
  });
});
