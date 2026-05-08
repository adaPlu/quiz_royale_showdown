import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useGameStore } from '../gameStore';

beforeEach(() => {
  act(() => useGameStore.getState().resetRoom());
});

describe('applyLootDrop', () => {
  it('increments the correct inventory key', () => {
    act(() => useGameStore.getState().applyLootDrop('FIFTY_FIFTY', 1));
    expect(useGameStore.getState().powerupInventory['FIFTY_FIFTY']).toBe(1);
  });

  it('accumulates across multiple drops of the same type', () => {
    act(() => useGameStore.getState().applyLootDrop('SHIELD', 1));
    act(() => useGameStore.getState().applyLootDrop('SHIELD', 1));
    expect(useGameStore.getState().powerupInventory['SHIELD']).toBe(2);
  });

  it('tracks different power-up types independently', () => {
    act(() => {
      useGameStore.getState().applyLootDrop('FIFTY_FIFTY', 1);
      useGameStore.getState().applyLootDrop('SHIELD', 2);
    });
    const inv = useGameStore.getState().powerupInventory;
    expect(inv['FIFTY_FIFTY']).toBe(1);
    expect(inv['SHIELD']).toBe(2);
  });
});

describe('applyFiftyFiftyMask', () => {
  it('sets fiftyFiftyEliminated to the provided indices', () => {
    act(() => useGameStore.getState().applyFiftyFiftyMask([1, 3]));
    expect(useGameStore.getState().fiftyFiftyEliminated).toEqual([1, 3]);
  });

  it('overwrites a previous mask when called again', () => {
    act(() => useGameStore.getState().applyFiftyFiftyMask([0, 2]));
    act(() => useGameStore.getState().applyFiftyFiftyMask([1, 3]));
    expect(useGameStore.getState().fiftyFiftyEliminated).toEqual([1, 3]);
  });

  it('is cleared by resetRoom', () => {
    act(() => useGameStore.getState().applyFiftyFiftyMask([0, 1]));
    act(() => useGameStore.getState().resetRoom());
    expect(useGameStore.getState().fiftyFiftyEliminated).toEqual([]);
  });
});

describe('setMyAnswer', () => {
  it('sets myAnswerIndex without clobbering other state', () => {
    act(() => {
      useGameStore.getState().applyLootDrop('SHIELD', 1);
      useGameStore.getState().setMyAnswer(2);
    });
    const state = useGameStore.getState();
    expect(state.myAnswerIndex).toBe(2);
    expect(state.powerupInventory['SHIELD']).toBe(1);
  });
});

describe('resetRoom', () => {
  it('clears phase, question, myAnswerIndex, and powerupInventory', () => {
    act(() => {
      useGameStore.getState().applyLootDrop('SHIELD', 3);
      useGameStore.getState().setMyAnswer(1);
    });
    act(() => useGameStore.getState().resetRoom());
    const state = useGameStore.getState();
    expect(state.phase).toBe('WAITING');
    expect(state.question).toBeNull();
    expect(state.myAnswerIndex).toBeNull();
    expect(state.powerupInventory).toEqual({});
  });
});

describe('applyRoomState', () => {
  it('restores phase, roundNumber, and players from a room snapshot', () => {
    act(() =>
      useGameStore.getState().applyRoomState({
        room: {
          roomId: 'room-1',
          code: 'ABC123',
          phase: 'QUESTION_ACTIVE',
          roundNumber: 3,
          totalRounds: 10,
          players: [
            { id: 'p1', displayName: 'Alice', score: 500, streak: 2, isEliminated: false },
          ],
        },
      }),
    );
    const state = useGameStore.getState();
    expect(state.phase).toBe('QUESTION_ACTIVE');
    expect(state.roundNumber).toBe(3);
    expect(state.players).toHaveLength(1);
    expect(state.players[0].displayName).toBe('Alice');
  });
});

describe('applyLevelUp', () => {
  it('appends a level-up entry to levelUpQueue', () => {
    act(() =>
      useGameStore.getState().applyLevelUp({
        playerId: 'p1',
        newLevel: 5,
        xp: 200,
        xpToNextLevel: 800,
      }),
    );
    const { levelUpQueue } = useGameStore.getState();
    expect(levelUpQueue).toHaveLength(1);
    expect(levelUpQueue[0].newLevel).toBe(5);
  });

  it('accumulates multiple level-ups in order', () => {
    act(() => {
      useGameStore.getState().applyLevelUp({ playerId: 'p1', newLevel: 2, xp: 100, xpToNextLevel: 900 });
      useGameStore.getState().applyLevelUp({ playerId: 'p1', newLevel: 3, xp: 150, xpToNextLevel: 850 });
    });
    expect(useGameStore.getState().levelUpQueue).toHaveLength(2);
    expect(useGameStore.getState().levelUpQueue[0].newLevel).toBe(2);
    expect(useGameStore.getState().levelUpQueue[1].newLevel).toBe(3);
  });
});

describe('dismissLevelUp', () => {
  it('removes the first entry from levelUpQueue', () => {
    act(() => {
      useGameStore.getState().applyLevelUp({ playerId: 'p1', newLevel: 2, xp: 100, xpToNextLevel: 900 });
      useGameStore.getState().applyLevelUp({ playerId: 'p1', newLevel: 3, xp: 150, xpToNextLevel: 850 });
    });
    act(() => useGameStore.getState().dismissLevelUp());
    const { levelUpQueue } = useGameStore.getState();
    expect(levelUpQueue).toHaveLength(1);
    expect(levelUpQueue[0].newLevel).toBe(3);
  });

  it('is a no-op on an empty queue', () => {
    act(() => useGameStore.getState().dismissLevelUp());
    expect(useGameStore.getState().levelUpQueue).toHaveLength(0);
  });
});

describe('applyGameOver', () => {
  it('sets phase to GAME_OVER with winnerId and finalScores', () => {
    act(() =>
      useGameStore.getState().applyGameOver({
        roomId: 'room-1',
        winnerId: 'p1',
        finalStandings: [
          { playerId: 'p1', rank: 1, score: 1200, xpAwarded: 500 },
          { playerId: 'p2', rank: 2, score: 800,  xpAwarded: 300 },
        ],
      }),
    );
    const state = useGameStore.getState();
    expect(state.phase).toBe('GAME_OVER');
    expect(state.winnerId).toBe('p1');
    expect(state.finalScores).toHaveLength(2);
    expect(state.finalScores[0].xpAwarded).toBe(500);
  });
});
