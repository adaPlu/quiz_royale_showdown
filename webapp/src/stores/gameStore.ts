import { create } from 'zustand';

import type { ServerEvent } from '@/lib/contracts';
import type { PowerUpCode } from '@/stores/profileStore';
import type { PlayerSummary } from '@/types/game';

export type PowerupFeedbackEvent = {
  id: string;
  kind: 'activated' | 'effect';
  powerUpCode: PowerUpCode;
  effectType?: string;
};

export type GamePhase =
  | 'WAITING'
  | 'COUNTDOWN'
  | 'QUESTION_ACTIVE'
  | 'ANSWER_LOCKED'
  | 'ROUND_RESULT'
  | 'ELIMINATION'
  | 'FINALE'
  | 'GAME_OVER';

export type QuestionState = {
  roundId: string;
  questionId: string;
  prompt: string;
  answers: string[];
  timeLimitMs: number;
  startedAt: string;
};

export type RoundResult = {
  correctAnswerIndex: number;
  rankings: Array<{ playerId: string; scoreDelta: number; totalScore: number }>;
};

export type FinalStanding = {
  playerId: string;
  rank: number;
  score: number;
  xpAwarded: number;
};

export type LevelUpEntry = {
  playerId: string;
  newLevel: number;
  xp: number;
  xpToNextLevel: number;
};

type RoomStatePayload = {
  room: {
    roomId: string;
    code: string;
    phase: GamePhase;
    roundNumber: number;
    totalRounds: number;
    players: PlayerSummary[];
  };
};

type CountdownPayload = {
  roomId: string;
  startsAt: string;
  seconds: number;
};

type QuestionPayload = {
  roomId: string;
  roundId: string;
  questionId: string;
  prompt: string;
  answers: string[];
  timeLimitMs: number;
  startedAt: string;
};

type AnswerLockedPayload = {
  roomId: string;
  roundId: string;
  lockedAt: string;
};

type RoundResultPayload = {
  roomId: string;
  roundId: string;
  correctAnswerIndex: number;
  rankings: Array<{ playerId: string; scoreDelta: number; totalScore: number }>;
};

type EliminationPayload = {
  roomId: string;
  eliminatedPlayerIds: string[];
  survivors: PlayerSummary[];
};

type FinaleStartedPayload = {
  roomId: string;
  finalistIds: string[];
};

type PowerupActivatedPayload = {
  roomId: string;
  userId: string;
  powerUpId: string;
  effect: Record<string, unknown>;
};

type PowerupEffectPayload = {
  roomId: string;
  userId: string;
  powerUpId: string;
  effect: Record<string, unknown>;
};

type GameOverPayload = {
  roomId: string;
  winnerId: string;
  finalStandings: FinalStanding[];
};

type LevelUpPayload = LevelUpEntry;

type ActivePowerupEffect = {
  effectType: string;
  affectedPlayerIds: string[];
  data?: unknown;
};

type GameState = {
  roomId: string | null;
  code: string | null;
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  players: PlayerSummary[];
  question: QuestionState | null;
  result: RoundResult | null;
  myAnswerIndex: number | null;
  countdownEndsAt: number | null;
  winnerId: string | null;
  finalScores: FinalStanding[];
  levelUpQueue: LevelUpEntry[];
  usedPowerUps: string[];
  fiftyFiftyEliminated: number[];
  revealedOptionIndex: number | null;
  timeBoostActive: boolean;
  activePowerupEffect: ActivePowerupEffect | null;
  lootDrop: { powerupCode: string; ts: number } | null;
};

type GameActions = {
  applyRoomState: (payload: RoomStatePayload) => void;
  applyPlayerJoined: (payload: { roomId: string; player: PlayerSummary }) => void;
  applyPlayerLeft: (payload: { roomId: string; playerId: string }) => void;
  applyCountdown: (payload: CountdownPayload) => void;
  applyQuestion: (payload: QuestionPayload) => void;
  applyAnswerLocked: (payload: AnswerLockedPayload) => void;
  applyRoundResult: (payload: RoundResultPayload) => void;
  applyElimination: (payload: EliminationPayload) => void;
  applyFinaleStarted: (payload: FinaleStartedPayload) => void;
  applyPowerupUsed: (payload: PowerupActivatedPayload) => void;
  applyPowerupEffect: (payload: PowerupEffectPayload) => void;
  applyGameOver: (payload: GameOverPayload) => void;
  applyLevelUp: (payload: LevelUpPayload) => void;
  setMyAnswer: (index: number) => void;
  dismissLevelUp: () => void;
  resetRoom: () => void;
  applyServerEvent: (event: ServerEvent) => void;
  setLootDrop: (code: string) => void;
  clearLootDrop: () => void;
};

const initialState: GameState = {
  roomId: null,
  code: null,
  phase: 'WAITING',
  roundNumber: 0,
  totalRounds: 10,
  players: [],
  question: null,
  result: null,
  myAnswerIndex: null,
  countdownEndsAt: null,
  winnerId: null,
  finalScores: [],
  levelUpQueue: [],
  usedPowerUps: [],
  fiftyFiftyEliminated: [],
  revealedOptionIndex: null,
  timeBoostActive: false,
  activePowerupEffect: null,
  lootDrop: null,
};

const resetRoundInteraction: Pick<
  GameState,
  | 'result'
  | 'myAnswerIndex'
  | 'fiftyFiftyEliminated'
  | 'revealedOptionIndex'
  | 'timeBoostActive'
  | 'activePowerupEffect'
> = {
  result: null,
  myAnswerIndex: null,
  fiftyFiftyEliminated: [],
  revealedOptionIndex: null,
  timeBoostActive: false,
  activePowerupEffect: null,
};

export const useGameStore = create<GameState & GameActions>((set, get) => ({
  ...initialState,

  applyRoomState: (payload) => {
    set({
      roomId: payload.room.roomId,
      code: payload.room.code,
      phase: payload.room.phase,
      roundNumber: payload.room.roundNumber,
      totalRounds: payload.room.totalRounds,
      players: payload.room.players,
    });
  },

  applyPlayerJoined: (payload) => {
    set((state) => {
      const exists = state.players.some((player) => player.id === payload.player.id);
      return {
        roomId: state.roomId ?? payload.roomId,
        players: exists
          ? state.players.map((player) => (player.id === payload.player.id ? payload.player : player))
          : [...state.players, payload.player],
      };
    });
  },

  applyPlayerLeft: (payload) => {
    set((state) => ({
      players: state.players.filter((player) => player.id !== payload.playerId),
    }));
  },

  applyCountdown: (payload) => {
    set({
      roomId: payload.roomId,
      phase: 'COUNTDOWN',
      question: null,
      ...resetRoundInteraction,
      countdownEndsAt: new Date(payload.startsAt).getTime() + payload.seconds * 1000,
    });
  },

  applyQuestion: (payload) => {
    set({
      roomId: payload.roomId,
      phase: 'QUESTION_ACTIVE',
      question: {
        roundId: payload.roundId,
        questionId: payload.questionId,
        prompt: payload.prompt,
        answers: payload.answers,
        timeLimitMs: payload.timeLimitMs,
        startedAt: payload.startedAt,
      },
      ...resetRoundInteraction,
    });
  },

  applyAnswerLocked: () => {
    set({ phase: 'ANSWER_LOCKED' });
  },

  applyRoundResult: (payload) => {
    set((state) => {
      const playersById = new Map(state.players.map((player) => [player.id, player]));
      const rankedPlayers = payload.rankings.map((ranking) => {
        const existing = playersById.get(ranking.playerId);
        return {
          id: ranking.playerId,
          displayName: existing?.displayName ?? ranking.playerId,
          avatarUrl: existing?.avatarUrl,
          score: ranking.totalScore,
          streak: existing?.streak ?? 0,
          isEliminated: existing?.isEliminated ?? false,
        };
      });
      const unrankedPlayers = state.players.filter(
        (player) => !payload.rankings.some((ranking) => ranking.playerId === player.id),
      );

      return {
        roomId: payload.roomId,
        phase: 'ROUND_RESULT',
        result: {
          correctAnswerIndex: payload.correctAnswerIndex,
          rankings: payload.rankings,
        },
        players: [...rankedPlayers, ...unrankedPlayers],
      };
    });
  },

  applyElimination: (payload) => {
    set({
      roomId: payload.roomId,
      phase: 'ELIMINATION',
      players: payload.survivors,
    });
  },

  applyFinaleStarted: (payload) => {
    set((state) => ({
      roomId: payload.roomId,
      phase: 'FINALE',
      players: state.players.map((player) => ({
        ...player,
        isEliminated: !payload.finalistIds.includes(player.id),
      })),
    }));
  },

  applyPowerupUsed: (payload) => {
    set((state) => ({
      usedPowerUps: state.usedPowerUps.includes(payload.powerUpId)
        ? state.usedPowerUps
        : [...state.usedPowerUps, payload.powerUpId],
    }));
  },

  applyPowerupEffect: (payload) => {
    const effectType = String(payload.effect.type ?? '');
    const affectedPlayerIds = [payload.userId].filter(Boolean);
    const effect = {
      effectType,
      affectedPlayerIds,
      data: payload.effect,
    };

    if (effectType === 'FIFTY_FIFTY') {
      const data = payload.effect as { maskedAnswerIndices?: number[] };
      set({
        activePowerupEffect: effect,
        fiftyFiftyEliminated: data.maskedAnswerIndices ?? [],
      });
      return;
    }

    if (effectType === 'REVEAL' || effectType === 'REVEAL_WRONG') {
      const data = payload.effect as { revealedAnswerIndex?: number };
      set({
        activePowerupEffect: effect,
        revealedOptionIndex: data.revealedAnswerIndex ?? null,
      });
      return;
    }

    if (effectType === 'TIME_BOOST' || effectType === 'TIME_FREEZE') {
      set({ activePowerupEffect: effect, timeBoostActive: true });
      return;
    }

    set({ activePowerupEffect: effect });
  },

  applyGameOver: (payload) => {
    set({
      roomId: payload.roomId,
      phase: 'GAME_OVER',
      winnerId: payload.winnerId,
      finalScores: payload.finalStandings,
    });
  },

  applyLevelUp: (payload) => {
    set((state) => ({ levelUpQueue: [...state.levelUpQueue, payload] }));
  },

  setMyAnswer: (index) => set({ myAnswerIndex: index }),

  dismissLevelUp: () => {
    set((state) => ({ levelUpQueue: state.levelUpQueue.slice(1) }));
  },

  resetRoom: () => set({ ...initialState }),

  applyServerEvent: (event) => {
    switch (event.type) {
      case 'room:state_sync':
        get().applyRoomState(event.payload);
        break;
      case 'room:player_joined':
        get().applyPlayerJoined(event.payload);
        break;
      case 'room:player_left':
        get().applyPlayerLeft(event.payload);
        break;
      case 'round:countdown_started':
        get().applyCountdown(event.payload);
        break;
      case 'round:question_started':
        get().applyQuestion(event.payload);
        break;
      case 'round:answer_locked':
        get().applyAnswerLocked(event.payload);
        break;
      case 'round:result':
        get().applyRoundResult(event.payload);
        break;
      case 'round:elimination':
        get().applyElimination(event.payload);
        break;
      case 'round:finale_started':
        get().applyFinaleStarted(event.payload);
        break;
      case 'game:over':
        get().applyGameOver(event.payload);
        break;
      case 'powerup:activated':
        get().applyPowerupUsed(event.payload);
        break;
      case 'powerup:effect':
        get().applyPowerupEffect(event.payload);
        break;
      case 'powerup:loot_drop':
        get().setLootDrop((event.payload as { powerupCode: string }).powerupCode);
        break;
    }
  },

  setLootDrop: (code) => set({ lootDrop: { powerupCode: code, ts: Date.now() } }),
  clearLootDrop: () => set({ lootDrop: null }),
}));

export const selectLeaderboard = (state: GameState): PlayerSummary[] =>
  [...state.players].sort((a, b) => b.score - a.score);

export const selectAlivePlayers = (state: GameState): PlayerSummary[] =>
  state.players.filter((player) => !player.isEliminated);

export const selectRevealOptionId = (state: GameState): number | null => state.revealedOptionIndex;

export const selectTimeBoostActive = (state: GameState): boolean => state.timeBoostActive;
