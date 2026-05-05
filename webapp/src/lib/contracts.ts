import { z } from "zod";

export const playerSummarySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().optional(),
  score: z.number(),
  streak: z.number(),
  isEliminated: z.boolean()
});

export const roomSnapshotSchema = z.object({
  roomId: z.string(),
  code: z.string(),
  phase: z.enum([
    "WAITING",
    "COUNTDOWN",
    "QUESTION_ACTIVE",
    "ANSWER_LOCKED",
    "ROUND_RESULT",
    "ELIMINATION",
    "FINALE",
    "GAME_OVER"
  ]),
  roundNumber: z.number(),
  totalRounds: z.number(),
  players: z.array(playerSummarySchema)
});

const envelope = <TType extends string, TPayload extends z.ZodTypeAny>(type: TType, payload: TPayload) =>
  z.object({
    type: z.literal(type),
    version: z.literal("v1"),
    payload
  });

export const serverEventSchema = z.discriminatedUnion("type", [
  envelope("room:state_sync", z.object({ room: roomSnapshotSchema })),
  envelope("room:player_joined", z.object({ roomId: z.string(), player: playerSummarySchema })),
  envelope("room:player_left", z.object({ roomId: z.string(), playerId: z.string() })),
  envelope(
    "round:countdown_started",
    z.object({ roomId: z.string(), startsAt: z.string(), seconds: z.number() })
  ),
  envelope(
    "round:question_started",
    z.object({
      roomId: z.string(),
      roundId: z.string(),
      questionId: z.string(),
      prompt: z.string(),
      answers: z.array(z.string()).length(4),
      timeLimitMs: z.number(),
      startedAt: z.string()
    })
  ),
  envelope("round:answer_locked", z.object({ roomId: z.string(), roundId: z.string(), lockedAt: z.string() })),
  envelope(
    "round:result",
    z.object({
      roomId: z.string(),
      roundId: z.string(),
      correctAnswerIndex: z.number(),
      rankings: z.array(z.object({ playerId: z.string(), scoreDelta: z.number(), totalScore: z.number() }))
    })
  ),
  envelope(
    "round:elimination",
    z.object({
      roomId: z.string(),
      eliminatedPlayerIds: z.array(z.string()),
      survivors: z.array(playerSummarySchema)
    })
  ),
  envelope("round:finale_started", z.object({ roomId: z.string(), finalistIds: z.array(z.string()) })),
  envelope(
    "powerup:activated",
    z.object({
      roomId: z.string(),
      powerUpId: z.string(),
      userId: z.string(),
      effect: z.record(z.unknown())
    })
  ),
  envelope(
    "powerup:effect",
    z.object({
      roomId: z.string(),
      powerUpId: z.string(),
      userId: z.string(),
      effect: z.record(z.unknown())
    })
  ),
  envelope(
    "powerup:loot_drop",
    z.object({ roomId: z.string(), powerupType: z.string(), quantity: z.number() })
  ),
  envelope(
    "game:over",
    z.object({
      roomId: z.string(),
      winnerId: z.string(),
      finalStandings: z.array(
        z.object({
          playerId: z.string(),
          rank: z.number(),
          score: z.number(),
          xpAwarded: z.number()
        })
      )
    })
  ),
  envelope(
    "game:level_up",
    z.object({
      playerId: z.string(),
      newLevel: z.number(),
      xpAwarded: z.number(),
      xpToNextLevel: z.number()
    })
  )
]);

export type ServerEvent = z.infer<typeof serverEventSchema>;

export type ClientEvent =
  | { type: "room:join"; version: "v1"; payload: { roomCode: string } }
  | {
      type: "round:submit_answer";
      version: "v1";
      payload: { roomId: string; questionId: string; answerIndex: number; clientSentAt: string };
    }
  | {
      type: "powerup:activate";
      version: "v1";
      payload: { roomId: string; powerUpId: string; targetPlayerId?: string };
    }
  | { type: "client:heartbeat"; version: "v1"; payload: { roomId: string; sentAt: string } };
