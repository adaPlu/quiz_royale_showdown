import { act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { useGameStore } from '@/stores/gameStore';

// Capture registered handlers so tests can fire them manually
const capturedHandlers: Record<string, (payload: unknown) => void> = {};

vi.mock('@/services/socketService', () => ({
  socketService: {
    on: vi.fn((event: string, handler: (p: unknown) => void) => {
      capturedHandlers[event] = handler;
      return () => {};
    }),
    setActiveRoom: vi.fn(),
    updateRoomSnapshot: vi.fn(),
  },
}));

// Import hook after mocks are set
import { useGameSocket } from '../useGameSocket';

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k]);
  act(() => useGameStore.getState().resetRoom());
});

describe('useGameSocket', () => {
  it('room:state_sync restores phase and players in gameStore', () => {
    renderHook(() => useGameSocket('room-1'), { wrapper });

    act(() => {
      capturedHandlers['room:state_sync']?.({
        room: {
          roomId: 'room-1',
          code: 'ABC123',
          phase: 'QUESTION_ACTIVE',
          roundNumber: 2,
          totalRounds: 10,
          players: [{ id: 'p1', displayName: 'Alice', score: 0, streak: 0, isEliminated: false }],
        },
      });
    });

    const state = useGameStore.getState();
    expect(state.phase).toBe('QUESTION_ACTIVE');
    expect(state.players).toHaveLength(1);
  });

  it('powerup:loot_drop increments powerupInventory via applyLootDrop', () => {
    renderHook(() => useGameSocket('room-1'), { wrapper });

    act(() => {
      capturedHandlers['powerup:loot_drop']?.({ powerupType: 'SHIELD', quantity: 1 });
    });

    expect(useGameStore.getState().powerupInventory['SHIELD']).toBe(1);
  });
});
