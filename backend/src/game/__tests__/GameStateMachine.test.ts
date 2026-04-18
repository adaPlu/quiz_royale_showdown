import { describe, expect, it } from 'vitest';

import {
  createInitialGameState,
  transitionGameState,
  canTransition,
  isTerminalPhase,
} from '../GameStateMachine';

describe('GameStateMachine', () => {
  it('walks a standard elimination flow into game over', () => {
    let state = createInitialGameState();

    state = transitionGameState(state, { type: 'READY_FOR_COUNTDOWN', playerCount: 6 });
    state = transitionGameState(state, { type: 'BEGIN_QUESTION' });
    state = transitionGameState(state, { type: 'LOCK_ANSWERS' });
    state = transitionGameState(state, { type: 'SHOW_ROUND_RESULT' });
    state = transitionGameState(state, {
      type: 'APPLY_ELIMINATION',
      eliminatedPlayerIds: ['p5', 'p6'],
    });
    state = transitionGameState(state, { type: 'START_NEXT_ROUND' });
    state = transitionGameState(state, { type: 'BEGIN_QUESTION', question: 1 });
    state = transitionGameState(state, { type: 'LOCK_ANSWERS' });
    state = transitionGameState(state, { type: 'SHOW_ROUND_RESULT' });
    state = transitionGameState(state, {
      type: 'START_FINALE',
      finalistIds: ['p1', 'p2'],
    });
    state = transitionGameState(state, { type: 'BEGIN_QUESTION' });
    state = transitionGameState(state, { type: 'COMPLETE_GAME', winnerIds: ['p2'] });

    expect(state).toMatchObject({
      phase: 'GAME_OVER',
      round: 2,
      question: 2,
      playerCount: 2,
      isFinale: true,
      finalists: ['p1', 'p2'],
      winnerIds: ['p2'],
    });
    expect(isTerminalPhase(state.phase)).toBe(true);
  });

  it('allows only declared phase transitions', () => {
    expect(canTransition('WAITING', 'COUNTDOWN')).toBe(true);
    expect(canTransition('WAITING', 'ROUND_RESULT')).toBe(false);
    expect(canTransition('GAME_OVER', 'WAITING')).toBe(true);
  });

  it('rejects invalid events for the current phase', () => {
    const state = createInitialGameState();

    expect(() =>
      transitionGameState(state, {
        type: 'LOCK_ANSWERS',
      }),
    ).toThrow('Invalid game transition');
  });
});
