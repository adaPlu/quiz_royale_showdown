export type EventEnvelope<TType extends string, TPayload> = {
  type: TType;
  version: "v1";
  payload: TPayload;
};

export type PlayerSummary = {
  id: string;
  displayName: string;
  avatarUrl?: string;
  score: number;
  streak: number;
  isEliminated: boolean;
};

export type RoomSnapshot = {
  roomId: string;
  code: string;
  phase:
    | "WAITING"
    | "COUNTDOWN"
    | "QUESTION_ACTIVE"
    | "ANSWER_LOCKED"
    | "ROUND_RESULT"
    | "ELIMINATION"
    | "FINALE"
    | "GAME_OVER";
  roundNumber: number;
  totalRounds: number;
  players: PlayerSummary[];
};

export type SocketErrorEvent = EventEnvelope<
  "error",
  {
    code: string;
    message: string;
    details?: unknown;
  }
>;

export type ServerEvents =
  | EventEnvelope<"room:state_sync", { room: RoomSnapshot }>
  | EventEnvelope<"room:player_joined", { player: PlayerSummary; roomId: string }>
  | EventEnvelope<"room:player_left", { playerId: string; roomId: string }>
  | EventEnvelope<"round:countdown_started", { roomId: string; startsAt: string; seconds: number }>
  | EventEnvelope<
      "round:question_started",
      {
        roomId: string;
        roundId: string;
        questionId: string;
        prompt: string;
        answers: string[];
        timeLimitMs: number;
        startedAt: string;
      }
    >
  | EventEnvelope<"round:answer_locked", { roomId: string; roundId: string; lockedAt: string }>
  | EventEnvelope<
      "round:result",
      {
        roomId: string;
        roundId: string;
        correctAnswerIndex: number;
        rankings: Array<{ playerId: string; scoreDelta: number; totalScore: number }>;
      }
    >
  | EventEnvelope<
      "round:elimination",
      { roomId: string; eliminatedPlayerIds: string[]; survivors: PlayerSummary[] }
    >
  | EventEnvelope<"round:finale_started", { roomId: string; finalistIds: string[] }>
  | EventEnvelope<
      "game:over",
      {
        roomId: string;
        winnerId: string;
        finalStandings: Array<{ playerId: string; rank: number; score: number; xpAwarded: number }>;
      }
    >
  | EventEnvelope<
      "game:level_up",
      { userId: string; newLevel: number; xpAwarded: number; xpToNextLevel: number }
    >
  | EventEnvelope<
      "powerup:loot_drop",
      { powerupId: string; powerupType: string; quantity: number }
    >
  | EventEnvelope<
      "powerup:effect",
      { type: string; targetPlayerId?: string; [key: string]: unknown }
    >
  | EventEnvelope<
      "powerup:effect_private",
      { type: string; maskedAnswerIndices?: number[]; [key: string]: unknown }
    >
  | SocketErrorEvent;

export type ClientEvents =
  | EventEnvelope<"room:join", { roomCode: string }>
  | EventEnvelope<
      "round:submit_answer",
      { roomId: string; questionId: string; answerIndex: number; clientSentAt: string }
    >
  | EventEnvelope<"powerup:activate", { roomId: string; powerUpId: string; targetPlayerId?: string }>
  | EventEnvelope<"client:heartbeat", { roomId: string; sentAt: string }>;

export type AuthedSocketUser = {
  userId: string;
  email: string;
  displayName: string;
};
