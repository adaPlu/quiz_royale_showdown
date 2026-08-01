import { prisma } from "../../models/prismaClient";
import type { GameStateSnapshot } from "../../game/GameStateMachine";
import { gameOrchestrator } from "../../services/GameOrchestrator";
import { redisService } from "../../services/RedisService";
import { roomService } from "../../services/RoomService";
import type { RoomSnapshot } from "../../types/contracts";

export async function buildRoomSnapshot(roomId: string): Promise<RoomSnapshot | null> {
  await roomService.recoverStaleCountdown(
    roomId,
    gameOrchestrator.hasActiveGame(roomId)
  );

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      players: {
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true
            }
          }
        }
      }
    }
  });

  if (!room) {
    return null;
  }

  const scoreEntries = redisService
    ? await redisService.zrevrangeWithScores(`room:${roomId}:scores`, 0, -1)
    : [];
  const scores = Object.fromEntries(scoreEntries.map(({ member, score }) => [member, score]));
  const liveState = redisService
    ? await redisService.getJson<GameStateSnapshot>(`game:${roomId}:state`)
    : null;

  return {
    roomId: room.id,
    code: room.code,
    phase: liveState?.phase ?? room.status,
    roundNumber: liveState?.round ?? room.currentRound,
    totalRounds: room.totalRounds,
    players: room.players.map((player) => ({
      id: player.userId,
      displayName: player.user.displayName,
      avatarUrl: player.user.avatarUrl ?? undefined,
      score: scores[player.userId] ?? player.score,
      streak: player.streak,
      isEliminated: player.isEliminated
    }))
  };
}
