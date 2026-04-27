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
