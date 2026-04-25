import { create } from 'zustand';

import type { ServerEvent, ServerEventPayload } from '@/lib/contracts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type GamePhase = ServerEventPayload<'room:state_sync'>['room']['phase'];

export interface PlayerSummary {
  id: string;
  displayName: string;
  avatarUrl?: string;
  score: number;
  streak: number;
  isEliminated: boolean;
}

export interface QuestionState {
  roundId: string;
  questionId: string;
  prompt: string;
  answers: string[];
  timeLimitMs: number;
  startedAt: string;
}

export interface RoundResult {
  correctAnswerIndex: number;
  rankings: Array<{ playerId: string; scoreDelta: number; totalScore: number }>;
}

export interface FinalStanding {
  playerId: string;
  rank: number;
  score: number;
  xpAwarded: number;
}

export interface LevelUpEntry {
  playerId: string;
  newLevel: number;
  xp: number;
  xpToNextLevel: number;
}

export interface ActivePowerupEffect {
  effectType: string;
  affectedPlayerIds: string[];
  data?: unknown;
  expiresAt?: number;
}

interface GameState {
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
  fiftyFiftyEliminated: number[];
  revealedOptionIndex: number | null;
  timeBoostActive: boolean;
  activePowerupEffect: ActivePowerupEffect | null;
}

interface GameActions {
  applyRoomState: (payload: RoomStatePayload) => void;
  applyPlayerJoined: (payload: RoomPlayerJoinedPayload) => void;
  applyPlayerLeft: (payload: RoomPlayerLeftPayload) => void;
  applyCountdown: (payload: CountdownPayload) => void;
  applyQuestion: (payload: QuestionPayload) => void;
  applyAnswerLocked: (payload: AnswerLockedPayload) => void;
  applyRoundResult: (payload: RoundResultPayload) => void;
  applyElimination: (payload: RoundEliminationPayload) => void;
  applyFinaleStarted: (payload: RoundFinaleStartedPayload) => void;
  applyPowerupUsed: (payload: PowerupUsedPayload) => void;
  applyPowerupEffect: (payload: PowerupEffectPayload) => void;
  applyGameOver: (payload: GameOverPayload) => void;
  applyLevelUp: (payload: LevelUpPayload) => void;
  setMyAnswer: (index: number) => void;
  dismissLevelUp: () => void;
  resetRoom: () => void;
  applyServerEvent: (event: LegacyServerEvent) => void;
}

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------
type RoomStatePayload = ServerEventPayload<'room:state_sync'>;
type RoomPlayerJoinedPayload = ServerEventPayload<'room:player_joined'>;
type RoomPlayerLeftPayload = ServerEventPayload<'room:player_left'>;
type CountdownPayload = ServerEventPayload<'round:countdown_started'>;
type QuestionPayload = ServerEventPayload<'round:question_started'>;
type AnswerLockedPayload = ServerEventPayload<'round:answer_locked'>;
type RoundResultPayload = ServerEventPayload<'round:result'>;
type RoundEliminationPayload = ServerEventPayload<'round:elimination'>;
type RoundFinaleStartedPayload = ServerEventPayload<'round:finale_started'>;

interface PowerupUsedPayload {
  roomId: string;
  playerId: string;
  powerupId: string;
}

interface PowerupEffectPayload {
  roomId: string;
  effectType: string;
  affectedPlayerIds: string[];
  data?: unknown;
}

type GameOverPayload = ServerEventPayload<'game:over'>;

interface LevelUpPayload {
  playerId: string;
  newLevel: number;
  xp: number;
  xpToNextLevel: number;
}

type LegacyServerEvent = {
  type: ServerEvent['type'];
  version: string;
  payload: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------
const initialState: GameState = {
  roomId: null,
  code: null,
  phase: 'WAITING',
  roundNumber: 1,
  totalRounds: 10,
  players: [],
  question: null,
  result: null,
  myAnswerIndex: null,
  countdownEndsAt: null,
  winnerId: null,
  finalScores: [],
  levelUpQueue: [],
  fiftyFiftyEliminated: [],
  revealedOptionIndex: null,
  timeBoostActive: false,
  activePowerupEffect: null,
};

const mergePlayers = (currentPlayers: PlayerSummary[], nextPlayers: PlayerSummary[]) => {
  const playersById = new Map<string, PlayerSummary>();

  currentPlayers.forEach((player) => {
    playersById.set(player.id, player);
  });

  nextPlayers.forEach((player) => {
    playersById.set(player.id, player);
  });

  return Array.from(playersById.values());
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
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
    set((state) => ({
      players: mergePlayers(state.players, [payload.player]),
    }));
  },

  applyPlayerLeft: (payload) => {
    set((state) => ({
      players: state.players.filter((player) => player.id !== payload.playerId),
    }));
  },

  applyCountdown: (payload) => {
    set({
      phase: 'COUNTDOWN',
      result: null,
      countdownEndsAt: new Date(payload.startsAt).getTime() + payload.seconds * 1000,
    });
  },

  applyQuestion: (payload) => {
    set({
      phase: 'QUESTION_ACTIVE',
      myAnswerIndex: null,
      fiftyFiftyEliminated: [],
      revealedOptionIndex: null,
      timeBoostActive: false,
      activePowerupEffect: null,
      question: {
        roundId: payload.roundId,
        questionId: payload.questionId,
        prompt: payload.prompt,
        answers: payload.answers,
        timeLimitMs: payload.timeLimitMs,
        startedAt: payload.startedAt,
      },
    });
  },

  applyAnswerLocked: () => {
    set({ phase: 'ANSWER_LOCKED' });
  },

  applyRoundResult: (payload) => {
    set({
      phase: 'ROUND_RESULT',
      result: {
        correctAnswerIndex: payload.correctAnswerIndex,
        rankings: payload.rankings,
      },
      players: get().players.map((player) => {
        const ranking = payload.rankings.find((entry) => entry.playerId === player.id);
        return ranking ? { ...player, score: ranking.totalScore } : player;
      }),
    });
  },

  applyElimination: (payload) => {
    set((state) => ({
      phase: 'ELIMINATION',
      players: state.players.map((player) => {
        const survivor = payload.survivors.find((nextPlayer) => nextPlayer.id === player.id);
        if (survivor) {
          return survivor;
        }

        if (payload.eliminatedPlayerIds.includes(player.id)) {
          return { ...player, isEliminated: true };
        }

        return player;
      }),
    }));
  },

  applyFinaleStarted: () => {
    set({ phase: 'FINALE' });
  },

  applyPowerupUsed: () => {
    // Reserved for a later wave.
  },

  applyPowerupEffect: (payload) => {
    const effect: ActivePowerupEffect = {
      effectType: payload.effectType,
      affectedPlayerIds: payload.affectedPlayerIds,
      data: payload.data,
    };

    if (payload.effectType === 'fifty_fifty') {
      const data = payload.data as { eliminatedIndices?: number[] } | undefined;
      set({
        activePowerupEffect: effect,
        fiftyFiftyEliminated: data?.eliminatedIndices ?? [],
      });
      return;
    }

    if (payload.effectType === 'reveal_answer') {
      const data = payload.data as { revealedIndex?: number } | undefined;
      set({
        activePowerupEffect: effect,
        revealedOptionIndex: data?.revealedIndex ?? null,
      });
      return;
    }

    if (payload.effectType === 'time_boost') {
      set({ activePowerupEffect: effect, timeBoostActive: true });
      return;
    }

    set({ activePowerupEffect: effect });
  },

  applyGameOver: (payload) => {
    set({
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

  resetRoom: () => set(initialState),

  applyServerEvent: (event) => {
    const payload = event.payload as Record<string, unknown>;

    switch (event.type) {
      case 'room:state_sync':
        get().applyRoomState(payload as RoomStatePayload);
        break;
      case 'room:player_joined':
        get().applyPlayerJoined(payload as RoomPlayerJoinedPayload);
        break;
      case 'room:player_left':
        get().applyPlayerLeft(payload as RoomPlayerLeftPayload);
        break;
      case 'round:countdown_started':
        get().applyCountdown(payload as CountdownPayload);
        break;
      case 'round:question_started':
        get().applyQuestion(payload as QuestionPayload);
        break;
      case 'round:answer_locked':
        get().applyAnswerLocked(payload as AnswerLockedPayload);
        break;
      case 'round:result':
        get().applyRoundResult(payload as RoundResultPayload);
        break;
      case 'round:elimination':
        get().applyElimination(payload as RoundEliminationPayload);
        break;
      case 'round:finale_started':
        get().applyFinaleStarted(payload as RoundFinaleStartedPayload);
        break;
      case 'game:over':
        get().applyGameOver(payload as GameOverPayload);
        break;
    }
  },
}));

// ---------------------------------------------------------------------------
// Derived selectors
// ---------------------------------------------------------------------------
export const selectMyPlayer =
  (myId: string) =>
  (state: GameState): PlayerSummary | undefined =>
    state.players.find((player) => player.id === myId);

export const selectAlivePlayers = (state: GameState): PlayerSummary[] =>
  state.players.filter((player) => !player.isEliminated);

export const selectLeaderboard = (state: GameState): PlayerSummary[] =>
  [...state.players].sort((left, right) => right.score - left.score);

export const selectFiftyFiftyOptions = (state: GameState): boolean[] =>
  (state.question?.answers ?? []).map((_, index) => !state.fiftyFiftyEliminated.includes(index));

export const selectRevealOptionId = (state: GameState): number | null => state.revealedOptionIndex;

export const selectTimeBoostActive = (state: GameState): boolean => state.timeBoostActive;
