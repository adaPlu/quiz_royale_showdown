import { GAME_PHASES, type GamePhase } from './types';

export interface GameStateSnapshot {
  phase: GamePhase;
  round: number;
  question: number;
  playerCount: number;
  isFinale: boolean;
  finalists: readonly string[];
  eliminatedPlayerIds: readonly string[];
  winnerIds: readonly string[];
}

export type GameStateEvent =
  | { type: 'READY_FOR_COUNTDOWN'; playerCount: number }
  | { type: 'BEGIN_QUESTION'; question?: number }
  | { type: 'LOCK_ANSWERS' }
  | { type: 'SHOW_ROUND_RESULT' }
  | { type: 'APPLY_ELIMINATION'; eliminatedPlayerIds: readonly string[] }
  | { type: 'START_NEXT_ROUND' }
  | { type: 'START_FINALE'; finalistIds: readonly string[] }
  | { type: 'COMPLETE_GAME'; winnerIds: readonly string[] }
  | { type: 'RESET' };

const ALLOWED_TRANSITIONS: Readonly<Record<GamePhase, readonly GamePhase[]>> = {
  WAITING: ['COUNTDOWN'],
  COUNTDOWN: ['QUESTION_ACTIVE', 'WAITING'],
  QUESTION_ACTIVE: ['ANSWER_LOCKED', 'GAME_OVER'],
  ANSWER_LOCKED: ['ROUND_RESULT'],
  ROUND_RESULT: ['QUESTION_ACTIVE', 'ELIMINATION', 'FINALE', 'GAME_OVER'],
  ELIMINATION: ['COUNTDOWN', 'FINALE', 'GAME_OVER'],
  FINALE: ['QUESTION_ACTIVE', 'GAME_OVER'],
  GAME_OVER: ['WAITING'],
};

export const INITIAL_GAME_STATE: GameStateSnapshot = {
  phase: 'WAITING',
  round: 0,
  question: 0,
  playerCount: 0,
  isFinale: false,
  finalists: [],
  eliminatedPlayerIds: [],
  winnerIds: [],
};

export function createInitialGameState(): GameStateSnapshot {
  return { ...INITIAL_GAME_STATE };
}

export function isGamePhase(value: string): value is GamePhase {
  return (GAME_PHASES as readonly string[]).includes(value);
}

export function canTransition(from: GamePhase, to: GamePhase): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminalPhase(phase: GamePhase): boolean {
  return phase === 'GAME_OVER';
}

export function transitionGameState(
  state: GameStateSnapshot,
  event: GameStateEvent,
): GameStateSnapshot {
  if (event.type === 'RESET') {
    return createInitialGameState();
  }

  switch (state.phase) {
    case 'WAITING':
      if (event.type !== 'READY_FOR_COUNTDOWN') {
        break;
      }

      return commitTransition(state, 'COUNTDOWN', {
        playerCount: event.playerCount,
        round: 1,
        question: 0,
        isFinale: false,
        finalists: [],
        eliminatedPlayerIds: [],
        winnerIds: [],
      });

    case 'COUNTDOWN':
      if (event.type === 'BEGIN_QUESTION') {
        return commitTransition(state, 'QUESTION_ACTIVE', {
          question: event.question ?? state.question + 1,
        });
      }

      break;

    case 'QUESTION_ACTIVE':
      if (event.type === 'LOCK_ANSWERS') {
        return commitTransition(state, 'ANSWER_LOCKED');
      }

      if (event.type === 'COMPLETE_GAME') {
        return commitTransition(state, 'GAME_OVER', {
          winnerIds: [...event.winnerIds],
        });
      }

      break;

    case 'ANSWER_LOCKED':
      if (event.type === 'SHOW_ROUND_RESULT') {
        return commitTransition(state, 'ROUND_RESULT');
      }

      break;

    case 'ROUND_RESULT':
      if (event.type === 'BEGIN_QUESTION') {
        return commitTransition(state, 'QUESTION_ACTIVE', {
          question: event.question ?? state.question + 1,
        });
      }

      if (event.type === 'APPLY_ELIMINATION') {
        return commitTransition(state, 'ELIMINATION', {
          eliminatedPlayerIds: [...event.eliminatedPlayerIds],
          playerCount: Math.max(0, state.playerCount - event.eliminatedPlayerIds.length),
        });
      }

      if (event.type === 'START_FINALE') {
        return commitTransition(state, 'FINALE', {
          isFinale: true,
          finalists: [...event.finalistIds],
          playerCount: event.finalistIds.length,
        });
      }

      if (event.type === 'COMPLETE_GAME') {
        return commitTransition(state, 'GAME_OVER', {
          winnerIds: [...event.winnerIds],
        });
      }

      break;

    case 'ELIMINATION':
      if (event.type === 'START_NEXT_ROUND') {
        return commitTransition(state, 'COUNTDOWN', {
          round: state.round + 1,
          question: 0,
          eliminatedPlayerIds: [],
        });
      }

      if (event.type === 'START_FINALE') {
        return commitTransition(state, 'FINALE', {
          isFinale: true,
          finalists: [...event.finalistIds],
          playerCount: event.finalistIds.length,
          eliminatedPlayerIds: [],
        });
      }

      if (event.type === 'COMPLETE_GAME') {
        return commitTransition(state, 'GAME_OVER', {
          winnerIds: [...event.winnerIds],
        });
      }

      break;

    case 'FINALE':
      if (event.type === 'BEGIN_QUESTION') {
        return commitTransition(state, 'QUESTION_ACTIVE', {
          question: event.question ?? state.question + 1,
          isFinale: true,
        });
      }

      if (event.type === 'COMPLETE_GAME') {
        return commitTransition(state, 'GAME_OVER', {
          isFinale: true,
          winnerIds: [...event.winnerIds],
        });
      }

      break;

    case 'GAME_OVER':
      break;

    default: {
      const unknownPhase: never = state.phase;
      throw new Error(`Unhandled game phase: ${unknownPhase}`);
    }
  }

  throw new Error(`Invalid game transition: ${state.phase} + ${event.type}`);
}

function commitTransition(
  state: GameStateSnapshot,
  nextPhase: GamePhase,
  overrides: Partial<GameStateSnapshot> = {},
): GameStateSnapshot {
  if (!canTransition(state.phase, nextPhase)) {
    throw new Error(`Unsupported transition from ${state.phase} to ${nextPhase}`);
  }

  return {
    ...state,
    ...overrides,
    phase: nextPhase,
  };
}
