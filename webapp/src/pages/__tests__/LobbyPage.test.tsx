import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const { mockEmit, mockOn, mockSetActiveRoom } = vi.hoisted(() => ({
  mockEmit: vi.fn(),
  mockOn: vi.fn(() => vi.fn()), // returns an unsubscribe fn
  mockSetActiveRoom: vi.fn(),
}));

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
    selector: (s: {
      players: unknown[];
      phase: string;
      code: string | null;
      roomId: string | null;
    }) => unknown,
  ) =>
    selector({
      players: [],
      phase: 'WAITING',
      code: null,
      roomId: null,
    }),
}));

// Mock PlayerAvatar used in the players list
vi.mock('@/components/PlayerAvatar', () => ({
  PlayerAvatar: ({ player }: { player: { displayName: string } }) => (
    <span data-testid="player-avatar">{player?.displayName}</span>
  ),
}));

import { LobbyPage } from '../LobbyPage';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    renderPage();

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'XYZ123');

    const joinBtn = screen.getByRole('button', { name: /join room/i });
    await userEvent.click(joinBtn);

    expect(mockSetActiveRoom).toHaveBeenCalledWith('XYZ123', 'XYZ123');
    expect(mockEmit).toHaveBeenCalledWith('room:join', { roomCode: 'XYZ123' });
  });
});
