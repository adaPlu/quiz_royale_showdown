import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type GamePhase =
  | 'WAITING'
  | 'COUNTDOWN'
  | 'QUESTION_ACTIVE'
  | 'ANSWER_LOCKED'
  | 'ROUND_RESULT'
  | 'ELIMINATION'
  | 'FINALE'
  | 'GAME_OVER';

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
  roomId:              string | null;
  code:                string | null;
  phase:               GamePhase;
  roundNumber:         number;
  totalRounds:         number;
  players:             PlayerSummary[];
  question:            QuestionState | null;
  result:              RoundResult | null;
  myAnswerIndex:       number | null;
  countdownEndsAt:     number | null;
  winnerId:            string | null;
  finalScores:         FinalStanding[];
  levelUpQueue:        LevelUpEntry[];
  // Powerup state
  fiftyFiftyEliminated:  number[];   // indices eliminated by 50/50
  revealedOptionIndex:   number | null;
  timeBoostActive:       boolean;
  activePowerupEffect:   ActivePowerupEffect | null;
}

interface GameActions {
  applyRoomState:      (payload: RoomStatePayload) => void;
  applyCountdown:      (payload: CountdownPayload) => void;
  applyQuestion:       (payload: QuestionPayload) => void;
  applyAnswerLocked:   (payload: AnswerLockedPayload) => void;
  applyRoundResult:    (payload: RoundResultPayload) => void;
  applyPowerupUsed:    (payload: PowerupUsedPayload) => void;
  applyPowerupEffect:  (payload: PowerupEffectPayload) => void;
  applyGameOver:       (payload: GameOverPayload) => void;
  applyLevelUp:        (payload: LevelUpPayload) => void;
  setMyAnswer:         (index: number) => void;
  dismissLevelUp:      () => void;
  resetRoom:           () => void;
  // Legacy adapter for old socket service shape
  applyServerEvent:    (event: LegacyServerEvent) => void;
}

// ---------------------------------------------------------------------------
// Payload types matching socketService schemas
// ---------------------------------------------------------------------------
interface RoomStatePayload {
  room: {
    roomId: string;
    code: string;
    phase: GamePhase;
    roundNumber: number;
    totalRounds: number;
    players: PlayerSummary[];
  };
}

interface CountdownPayload {
  roomId: string;
  startsAt: string;
  seconds: number;
}

interface QuestionPayload {
  roomId: string;
  roundId: string;
  questionId: string;
  prompt: string;
  answers: string[];
  timeLimitMs: number;
  startedAt: string;
}

interface AnswerLockedPayload {
  roomId: string;
  roundId: string;
  lockedAt: string;
}

interface RoundResultPayload {
  roomId: string;
  roundId: string;
  correctAnswerIndex: number;
  rankings: Array<{ playerId: string; scoreDelta: number; totalScore: number }>;
}

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

interface GameOverPayload {
  roomId: string;
  winnerId: string;
  finalStandings: FinalStanding[];
}

interface LevelUpPayload {
  playerId: string;
  newLevel: number;
  xp: number;
  xpToNextLevel: number;
}

// Legacy event shape from original socketService (contracts.ts)
type LegacyServerEvent = {
  type: string;
  version: string;
  payload: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------
const initialState: GameState = {
  roomId:              null,
  code:                null,
  phase:               'WAITING',
  roundNumber:         1,
  totalRounds:         10,
  players:             [],
  question:            null,
  result:              null,
  myAnswerIndex:       null,
  countdownEndsAt:     null,
  winnerId:            null,
  finalScores:         [],
  levelUpQueue:        [],
  fiftyFiftyEliminated: [],
  revealedOptionIndex:  null,
  timeBoostActive:      false,
  activePowerupEffect:  null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
export const useGameStore = create<GameState & GameActions>((set, get) => ({
  ...initialState,

  // ---- WS event handlers -------------------------------------------------

  applyRoomState: (payload) => {
    set({
      roomId:      payload.room.roomId,
      code:        payload.room.code,
      phase:       payload.room.phase,
      roundNumber: payload.room.roundNumber,
      totalRounds: payload.room.totalRounds,
      players:     payload.room.players,
    });
  },

  applyCountdown: (payload) => {
    set({
      phase:           'COUNTDOWN',
      result:          null,
      countdownEndsAt: new Date(payload.startsAt).getTime() + payload.seconds * 1000,
    });
  },

  applyQuestion: (payload) => {
    set({
      phase:               'QUESTION_ACTIVE',
      myAnswerIndex:       null,
      fiftyFiftyEliminated: [],
      revealedOptionIndex:  null,
      timeBoostActive:      false,
      activePowerupEffect:  null,
      question: {
        roundId:    payload.roundId,
        questionId: payload.questionId,
        prompt:     payload.prompt,
        answers:    payload.answers,
        timeLimitMs: payload.timeLimitMs,
        startedAt:  payload.startedAt,
      },
    });
  },

  applyAnswerLocked: (_payload) => {
    set({ phase: 'ANSWER_LOCKED' });
  },

  applyRoundResult: (payload) => {
    set({
      phase: 'ROUND_RESULT',
      result: {
        correctAnswerIndex: payload.correctAnswerIndex,
        rankings:           payload.rankings,
      },
      players: get().players.map((p) => {
        const ranking = payload.rankings.find((r) => r.playerId === p.id);
        return ranking ? { ...p, score: ranking.totalScore } : p;
      }),
    });
  },

  applyPowerupUsed: (_payload) => {
    // Could trigger UI feedback — no state change needed here
  },

  applyPowerupEffect: (payload) => {
    const effect: ActivePowerupEffect = {
      effectType:         payload.effectType,
      affectedPlayerIds:  payload.affectedPlayerIds,
      data:               payload.data,
    };

    if (payload.effectType === 'fifty_fifty') {
      const data = payload.data as { eliminatedIndices?: number[] } | undefined;
      set({
        activePowerupEffect:  effect,
        fiftyFiftyEliminated: data?.eliminatedIndices ?? [],
      });
    } else if (payload.effectType === 'reveal_answer') {
      const data = payload.data as { revealedIndex?: number } | undefined;
      set({ activePowerupEffect: effect, revealedOptionIndex: data?.revealedIndex ?? null });
    } else if (payload.effectType === 'time_boost') {
      set({ activePowerupEffect: effect, timeBoostActive: true });
    } else {
      set({ activePowerupEffect: effect });
    }
  },

  applyGameOver: (payload) => {
    set({
      phase:       'GAME_OVER',
      winnerId:    payload.winnerId,
      finalScores: payload.finalStandings,
    });
  },

  applyLevelUp: (payload) => {
    set((s) => ({ levelUpQueue: [...s.levelUpQueue, payload] }));
  },

  // ---- Other actions -----------------------------------------------------

  setMyAnswer: (index) => set({ myAnswerIndex: index }),

  dismissLevelUp: () =>
    set((s) => ({ levelUpQueue: s.levelUpQueue.slice(1) })),

  resetRoom: () => set(initialState),

  // ---- Legacy adapter for old contracts.ts ServerEvent shape -------------
  applyServerEvent: (event) => {
    const p = event.payload as Record<string, unknown>;
    switch (event.type) {
      case 'room:state_sync':
        get().applyRoomState(p as unknown as RoomStatePayload);
        break;
      case 'room:player_joined':
        set((s) => {
          const player = p['player'] as PlayerSummary;
          const exists = s.players.some((pl) => pl.id === player?.id);
          return exists ? {} : { players: [...s.players, player] };
        });
        break;
      case 'room:player_left':
        set((s) => ({
          players: s.players.filter((pl) => pl.id !== (p['playerId'] as string)),
        }));
        break;
      case 'round:countdown_started':
        get().applyCountdown(p as unknown as CountdownPayload);
        break;
      case 'round:question_started':
        get().applyQuestion(p as unknown as QuestionPayload);
        break;
      case 'round:answer_locked':
        get().applyAnswerLocked(p as unknown as AnswerLockedPayload);
        break;
      case 'round:result':
        get().applyRoundResult(p as unknown as RoundResultPayload);
        break;
      case 'round:elimination':
        set({
          phase:   'ELIMINATION',
          players: (p['survivors'] as PlayerSummary[]) ?? [],
        });
        break;
      case 'round:finale_started':
        set({ phase: 'FINALE' });
        break;
      case 'game:over':
        get().applyGameOver(p as unknown as GameOverPayload);
        break;
    }
  },
}));

// ---------------------------------------------------------------------------
// Derived selectors
// ---------------------------------------------------------------------------
export const selectMyPlayer =
  (myId: string) =>
  (s: GameState): PlayerSummary | undefined =>
    s.players.find((p) => p.id === myId);

export const selectAlivePlayers = (s: GameState): PlayerSummary[] =>
  s.players.filter((p) => !p.isEliminated);

export const selectLeaderboard = (s: GameState): PlayerSummary[] =>
  [...s.players].sort((a, b) => b.score - a.score);

export const selectFiftyFiftyOptions =
  (s: GameState): boolean[] =>
    (s.question?.answers ?? []).map((_, i) => !s.fiftyFiftyEliminated.includes(i));

export const selectRevealOptionId = (s: GameState): number | null =>
  s.revealedOptionIndex;

export const selectTimeBoostActive = (s: GameState): boolean =>
  s.timeBoostActive;
