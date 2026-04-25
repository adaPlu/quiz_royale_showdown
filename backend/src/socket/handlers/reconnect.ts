import { prisma } from "../../models/prismaClient";
import { redisService } from "../../services/RedisService";
import type { AuthenticatedSocket } from "../middleware";
import type { ServerEvents } from "../../types/contracts";
import { buildRoomSnapshot } from "./playerReady";

type ActiveQuestionContext = {
  roundId: string;
  questionId: string;
  prompt: string;
  answers: string[];
  timeLimitMs: number;
  startedAt: string;
};

const emitEnvelope = (socket: AuthenticatedSocket, envelope: ServerEvents): void => {
  socket.emit("message", envelope);
};

export async function syncRoomState(socket: AuthenticatedSocket, roomId: string): Promise<void> {
  const room = await buildRoomSnapshot(roomId);

  if (!room) {
    return;
  }

  emitEnvelope(socket, {
    type: "room:state_sync",
    version: "v1",
    payload: { room }
  });

  const questionContext = redisService
    ? await redisService.getJson<ActiveQuestionContext>(`game:${roomId}:current_question`)
    : null;

  if (questionContext) {
    emitEnvelope(socket, {
      type: "round:question_started",
      version: "v1",
      payload: {
        roomId,
        roundId: questionContext.roundId,
        questionId: questionContext.questionId,
        prompt: questionContext.prompt,
        answers: questionContext.answers,
        timeLimitMs: questionContext.timeLimitMs,
        startedAt: questionContext.startedAt
      }
    });
  }

  const latestRound = await prisma.round.findFirst({
    where: { roomId, lockedAt: { not: null } },
    orderBy: { startedAt: "desc" },
    select: { id: true, lockedAt: true }
  });

  if (latestRound?.lockedAt && room.phase !== "QUESTION_ACTIVE") {
    emitEnvelope(socket, {
      type: "round:answer_locked",
      version: "v1",
      payload: {
        roomId,
        roundId: latestRound.id,
        lockedAt: latestRound.lockedAt.toISOString()
      }
    });
  }
}
