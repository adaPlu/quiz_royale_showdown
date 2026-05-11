import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockEmit,
  mockOn,
  mockConnect,
  mockSetActiveRoom,
} = vi.hoisted(() => ({
  mockEmit: vi.fn(),
  mockOn: vi.fn(() => vi.fn()), // returns an unsubscribe stub by default
  mockConnect: vi.fn(),
  mockSetActiveRoom: vi.fn(),
}));

vi.mock('@/services/socketService', () => ({
  socketService: {
    connect: mockConnect,
    emit: mockEmit,
    on: mockOn,
    setActiveRoom: mockSetActiveRoom,
  },
}));

// ─── Store mocks ──────────────────────────────────────────────────────────────

const mockSetLootDrop = vi.fn();
const mockUpdateXp = vi.fn();

vi.mock('@/stores/gameStore', () => {
  const state = {
    code: null as string | null,
    setLootDrop: mockSetLootDrop,
    applyRoomState: vi.fn(),
    applyPlayerJoined: vi.fn(),
    applyPlayerLeft: vi.fn(),
    applyCountdown: vi.fn(),
    applyQuestion: vi.fn(),
    applyAnswerLocked: vi.fn(),
    applyRoundResult: vi.fn(),
    applyElimination: vi.fn(),
    applyFinaleStarted: vi.fn(),
    applyPowerupUsed: vi.fn(),
    applyPowerupEffect: vi.fn(),
    applyGameOver: vi.fn(),
    applyLevelUp: vi.fn(),
  };

  const useGameStore = (selector: (s: typeof state) => unknown) => selector(state);
  useGameStore.getState = () => state;

  return { useGameStore };
});

vi.mock('@/stores/profileStore', () => {
  const state = { updateXp: mockUpdateXp };
  const useProfileStore = (selector: (s: typeof state) => unknown) => selector(state);
  return { useProfileStore };
});

vi.mock('@/stores/authStore', () => {
  const state = { accessToken: 'test-token' };
  const useAuthStore = (selector: (s: typeof state) => unknown) => selector(state);
  return { useAuthStore };
});

// ─── react-router-dom stub ────────────────────────────────────────────────────

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// ─── Import hook after mocks ──────────────────────────────────────────────────

import { useGameSocket } from '../useGameSocket';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function reset() {
  vi.clearAllMocks();
  // Restore default: on() returns an unsubscribe stub
  mockOn.mockReturnValue(vi.fn());
}

beforeEach(reset);
afterEach(() => vi.clearAllMocks());

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useGameSocket', () => {
  describe('on mount with roomId and accessToken', () => {
    it('emits room:join', () => {
      renderHook(() => useGameSocket('room-abc'));
      expect(mockEmit).toHaveBeenCalledWith('room:join', expect.objectContaining({ roomCode: expect.any(String) }));
    });

    it('calls socketService.setActiveRoom with the roomId', () => {
      renderHook(() => useGameSocket('room-abc'));
      expect(mockSetActiveRoom).toHaveBeenCalledWith('room-abc', expect.anything());
    });

    it('calls socketService.connect with the access token', () => {
      renderHook(() => useGameSocket('room-abc'));
      expect(mockConnect).toHaveBeenCalledWith('test-token');
    });
  });

  describe('does NOT re-join if already joined (joinedRef guard)', () => {
    it('only emits room:join once across multiple renders with the same roomId', () => {
      const { rerender } = renderHook(() => useGameSocket('room-abc'));
      // Force a re-render (same roomId, same deps — hook guards via joinedRef)
      rerender();
      // room:join should only have been called once (on initial mount)
      const joinCalls = mockEmit.mock.calls.filter(([event]) => event === 'room:join');
      expect(joinCalls).toHaveLength(1);
    });
  });

  describe('on unmount', () => {
    it('resets joinedRef so the next mount re-joins', () => {
      const { unmount } = renderHook(() => useGameSocket('room-abc'));
      unmount();

      // After unmount, mounting again should emit room:join again
      reset();
      renderHook(() => useGameSocket('room-abc'));
      expect(mockEmit).toHaveBeenCalledWith('room:join', expect.objectContaining({ roomCode: expect.any(String) }));
    });

    it('calls all unsubscribe functions returned by socketService.on', () => {
      const unsub1 = vi.fn();
      const unsub2 = vi.fn();
      // Return different unsub stubs per call
      mockOn
        .mockReturnValueOnce(unsub1)
        .mockReturnValueOnce(unsub2)
        .mockReturnValue(vi.fn());

      const { unmount } = renderHook(() => useGameSocket('room-abc'));
      unmount();

      expect(unsub1).toHaveBeenCalled();
      expect(unsub2).toHaveBeenCalled();
    });
  });

  describe('game:over event', () => {
    it('triggers navigate to the results path with the roomId', () => {
      // Capture the handler registered for 'game:over'
      let gameOverHandler: ((payload: unknown) => void) | null = null;
      mockOn.mockImplementation((event: string, handler: (payload: unknown) => void) => {
        if (event === 'game:over') gameOverHandler = handler;
        return vi.fn();
      });

      renderHook(() => useGameSocket('room-abc'));

      expect(gameOverHandler).not.toBeNull();
      gameOverHandler!({ roomId: 'room-abc', winnerId: 'u1', finalStandings: [] });
      expect(mockNavigate).toHaveBeenCalledWith('/results/room-abc');
    });
  });

  describe('powerup:loot_drop event', () => {
    it('calls setLootDrop with powerupType when present', () => {
      let lootDropHandler: ((payload: unknown) => void) | null = null;
      mockOn.mockImplementation((event: string, handler: (payload: unknown) => void) => {
        if (event === 'powerup:loot_drop') lootDropHandler = handler;
        return vi.fn();
      });

      renderHook(() => useGameSocket('room-abc'));

      expect(lootDropHandler).not.toBeNull();
      lootDropHandler!({ roomId: 'room-abc', powerupType: 'shield', quantity: 1 });
      expect(mockSetLootDrop).toHaveBeenCalledWith('shield');
    });

    it('falls back to powerupId when powerupType is absent', () => {
      let lootDropHandler: ((payload: unknown) => void) | null = null;
      mockOn.mockImplementation((event: string, handler: (payload: unknown) => void) => {
        if (event === 'powerup:loot_drop') lootDropHandler = handler;
        return vi.fn();
      });

      renderHook(() => useGameSocket('room-abc'));

      lootDropHandler!({ roomId: 'room-abc', powerupType: undefined, powerupId: 'time_boost', quantity: 1 });
      expect(mockSetLootDrop).toHaveBeenCalledWith('time_boost');
    });
  });
});
