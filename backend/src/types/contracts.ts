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
  hostUserId: string;
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

export type ServerEvents =
  | EventEnvelope<"room:state_sync", { room: RoomSnapshot }>
  | EventEnvelope<"room:player_joined", { player: PlayerSummary; roomId: string }>
  | EventEnvelope<"room:player_left", { playerId: string; roomId: string }>
  | EventEnvelope<"room:ready_state", { roomId: string; readyPlayerIds: string[]; allReady: boolean }>
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
      "round:answer_submitted",
      { roomId: string; roundId: string; playerId: string; accepted: boolean }
    >
  | EventEnvelope<
      "powerup:activated",
      {
        roomId: string;
        powerUpId: string;
        userId: string;
        effect: Record<string, unknown>;
      }
    >
  | EventEnvelope<
      "powerup:effect",
      {
        roomId: string;
        powerUpId: string;
        userId: string;
        effect: Record<string, unknown>;
      }
    >
  | EventEnvelope<"error", { code: string; message: string; roomId?: string }>
  | EventEnvelope<
      "game:over",
      {
        roomId: string;
        winnerId: string;
        finalStandings: Array<{ playerId: string; rank: number; score: number; xpAwarded: number }>;
      }
    >;

export type ClientEvents =
  | EventEnvelope<"room:create", { isPrivate?: boolean; maxPlayers?: number }>
  | EventEnvelope<"room:join", { roomCode: string }>
  | EventEnvelope<"room:ready", { roomId: string }>
  | EventEnvelope<"room:start", { roomId: string }>
  | EventEnvelope<"room:leave", { roomId: string }>
  | EventEnvelope<"room:reconnect", { roomId: string }>
  | EventEnvelope<
      "round:submit_answer",
      { roomId: string; questionId: string; answerIndex: number; clientSentAt: string }
    >
  | EventEnvelope<
      "powerup:activate",
      { roomId: string; powerUpId: string; targetPlayerId?: string }
    >
  | EventEnvelope<"client:heartbeat", { roomId: string; sentAt: string }>;

export type AuthedSocketUser = {
  userId: string;
  email: string;
  displayName: string;
};
