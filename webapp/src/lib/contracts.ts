import { z } from "zod";

export const gamePhaseSchema = z.enum([
  "WAITING",
  "COUNTDOWN",
  "QUESTION_ACTIVE",
  "ANSWER_LOCKED",
  "ROUND_RESULT",
  "ELIMINATION",
  "FINALE",
  "GAME_OVER"
]);

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
  phase: gamePhaseSchema,
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

export const roomStateSyncPayloadSchema = z.object({ room: roomSnapshotSchema });
export const roomPlayerJoinedPayloadSchema = z.object({
  roomId: z.string(),
  player: playerSummarySchema
});
export const roomPlayerLeftPayloadSchema = z.object({
  roomId: z.string(),
  playerId: z.string()
});
export const roundCountdownStartedPayloadSchema = z.object({
  roomId: z.string(),
  startsAt: z.string(),
  seconds: z.number()
});
export const roundQuestionStartedPayloadSchema = z.object({
  roomId: z.string(),
  roundId: z.string(),
  questionId: z.string(),
  prompt: z.string(),
  answers: z.array(z.string()).length(4),
  timeLimitMs: z.number(),
  startedAt: z.string()
});
export const roundAnswerLockedPayloadSchema = z.object({
  roomId: z.string(),
  roundId: z.string(),
  lockedAt: z.string()
});
export const roundResultPayloadSchema = z.object({
  roomId: z.string(),
  roundId: z.string(),
  correctAnswerIndex: z.number(),
  rankings: z.array(
    z.object({
      playerId: z.string(),
      scoreDelta: z.number(),
      totalScore: z.number()
    })
  )
});
export const roundEliminationPayloadSchema = z.object({
  roomId: z.string(),
  eliminatedPlayerIds: z.array(z.string()),
  survivors: z.array(playerSummarySchema)
});
export const roundFinaleStartedPayloadSchema = z.object({
  roomId: z.string(),
  finalistIds: z.array(z.string())
});
export const gameOverPayloadSchema = z.object({
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
});
export const socketErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional()
});

export const powerupLootDropPayloadSchema = z.object({
  powerupType: z.enum(["DOUBLE_DOWN", "FIFTY_FIFTY", "TIME_FREEZE", "SHIELD", "SABOTAGE"]),
  quantity: z.number().int().min(1),
});

export type PowerupLootDropPayload = z.infer<typeof powerupLootDropPayloadSchema>;

export const gameLevelUpPayloadSchema = z.object({
  userId: z.string(),
  newLevel: z.number().int().min(1),
  xpAwarded: z.number().int().min(0),
  xpToNextLevel: z.number().int().min(0),
});

export type GameLevelUpPayload = z.infer<typeof gameLevelUpPayloadSchema>;

export const serverEventSchema = z.discriminatedUnion("type", [
  envelope("room:state_sync", roomStateSyncPayloadSchema),
  envelope("room:player_joined", roomPlayerJoinedPayloadSchema),
  envelope("room:player_left", roomPlayerLeftPayloadSchema),
  envelope("round:countdown_started", roundCountdownStartedPayloadSchema),
  envelope("round:question_started", roundQuestionStartedPayloadSchema),
  envelope("round:answer_locked", roundAnswerLockedPayloadSchema),
  envelope("round:result", roundResultPayloadSchema),
  envelope("round:elimination", roundEliminationPayloadSchema),
  envelope("round:finale_started", roundFinaleStartedPayloadSchema),
  envelope("game:over", gameOverPayloadSchema),
  envelope("game:level_up", gameLevelUpPayloadSchema),
  envelope("error", socketErrorPayloadSchema),
  envelope("powerup:loot_drop", powerupLootDropPayloadSchema)
]);

export type ServerEvent = z.infer<typeof serverEventSchema>;
export type ServerEventType = ServerEvent["type"];
export type ServerEventPayload<TType extends ServerEventType> = Extract<ServerEvent, { type: TType }>["payload"];

export type PowerupActivatePayload =
  | {
      roomId: string;
      powerUpId: string;
      targetPlayerId?: string;
    }
  | {
      roomId: string;
      powerupId: string;
      targetPlayerId?: string;
    };

export type ClientEvent =
  | { type: "room:join"; version: "v1"; payload: { roomCode: string } }
  | {
      type: "round:submit_answer";
      version: "v1";
      payload: { roomId: string; questionId: string; answerIndex: number; clientSentAt: string };
    }
  | { type: "powerup:activate"; version: "v1"; payload: PowerupActivatePayload }
  | { type: "client:heartbeat"; version: "v1"; payload: { roomId: string; sentAt: string } };

export type ClientEventType = ClientEvent["type"];
export type ClientEventPayload<TType extends ClientEventType> = Extract<ClientEvent, { type: TType }>["payload"];
