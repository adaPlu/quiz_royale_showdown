import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockEmit, mockOn, mockSetActiveRoom, mockLobbyState } = vi.hoisted(() => {
  const lobbyState = {
    players: [] as unknown[],
    phase: 'WAITING' as string,
    code: null as string | null,
    roomId: null as string | null,
  };
  return {
    mockEmit: vi.fn(),
    mockOn: vi.fn(() => vi.fn()), // returns an unsubscribe fn
    mockSetActiveRoom: vi.fn(),
    mockLobbyState: lobbyState,
  };
});

vi.mock('@/hooks/useGameSocket', () => ({
  useGameSocket: vi.fn(),
}));

vi.mock('@/services/socketService', () => ({
  socketService: {
    emit: mockEmit,
    on: mockOn,
    setActiveRoom: mockSetActiveRoom,
    connect: vi.fn(),
    disconnect: vi.fn(),
  },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (
    selector: (s: { user: { id: string; username: string; displayName: string } }) => unknown,
  ) => selector({ user: { id: 'u1', username: 'Alice', displayName: 'Alice' } }),
}));

vi.mock('@/stores/gameStore', () => ({
  useGameStore: (
    selector: (s: typeof mockLobbyState) => unknown,
  ) => selector(mockLobbyState),
}));

// Mock PlayerAvatar used in the players list
vi.mock('@/components/PlayerAvatar', () => ({
  PlayerAvatar: ({ player }: { player: { displayName: string } }) => (
    <span data-testid="player-avatar">{player?.displayName}</span>
  ),
}));

import { LobbyPage } from '../LobbyPage';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setLobbyState(overrides: Partial<typeof mockLobbyState>) {
  Object.assign(mockLobbyState, overrides);
}

function resetLobbyState() {
  Object.assign(mockLobbyState, {
    players: [],
    phase: 'WAITING',
    code: null,
    roomId: null,
  });
}

function renderPage(roomId = 'ABCDEF') {
  return render(
    <MemoryRouter initialEntries={[`/lobby/${roomId}`]}>
      <Routes>
        <Route path="/lobby/:roomId" element={<LobbyPage />} />
        <Route path="*" element={<LobbyPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockOn.mockReturnValue(vi.fn()); // always return unsub fn
  resetLobbyState();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('LobbyPage', () => {
  it('renders the "Live Lobby" heading', () => {
    renderPage();
    expect(screen.getByText(/live lobby/i)).toBeInTheDocument();
  });

  it('shows the Room Code input', () => {
    renderPage();
    // The label span shows "Room Code" exactly
    expect(screen.getByText('Room Code')).toBeInTheDocument();
    // The input itself (maxLength=6)
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('maxlength', '6');
  });

  it('shows validation error when code length < 6 and Join Room is clicked', async () => {
    renderPage();

    const input = screen.getByRole('textbox');
    // Clear current value and type a short code
    await userEvent.clear(input);
    await userEvent.type(input, 'AB');

    const joinBtn = screen.getByRole('button', { name: /join room/i });
    await userEvent.click(joinBtn);

    expect(
      screen.getByText(/room code must be exactly 6 characters/i),
    ).toBeInTheDocument();
  });

  it('calls socketService.emit with room:join when a valid 6-char code is entered', async () => {
    // Render with no pre-filled roomId so the input starts empty
    render(
      <MemoryRouter initialEntries={['/lobby']}>
        <Routes>
          <Route path="/lobby" element={<LobbyPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'XYZ123');

    const joinBtn = screen.getByRole('button', { name: /join room/i });
    await userEvent.click(joinBtn);

    expect(mockEmit).toHaveBeenCalledWith('room:join', { roomCode: 'XYZ123' });
  });

  it('displays the room code from gameStore.code when set', () => {
    setLobbyState({ code: 'LOBBY1', roomId: 'some-ulid' });
    renderPage('LOBBY1');
    // The pre-filled input should contain the code
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('LOBBY1');
  });
});

describe('LobbyPage — 10-second timeout', () => {
  it('shows "Could not connect to room" error after 10 seconds when storedRoomId stays null', async () => {
    vi.useFakeTimers();
    setLobbyState({ roomId: null });
    renderPage();

    // Advance the 10-second guard timeout
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    expect(
      screen.getByText(/could not connect to room/i),
    ).toBeInTheDocument();
  });

  it('clears the timeout and shows no error when storedRoomId updates before 10 seconds', async () => {
    vi.useFakeTimers();
    setLobbyState({ roomId: null });
    const { rerender } = renderPage();

    // Advance 5 seconds (halfway)
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    // Now roomId arrives — update mockLobbyState and re-render
    setLobbyState({ roomId: 'real-ulid-room-id' });
    await act(async () => {
      rerender(
        <MemoryRouter initialEntries={['/lobby/ABCDEF']}>
          <Routes>
            <Route path="/lobby/:roomId" element={<LobbyPage />} />
            <Route path="*" element={<LobbyPage />} />
          </Routes>
        </MemoryRouter>,
      );
    });

    // Advance remaining 5+ seconds — the timeout should have been cleared
    await act(async () => {
      vi.advanceTimersByTime(6_000);
    });

    expect(screen.queryByText(/could not connect to room/i)).toBeNull();
  });
});
