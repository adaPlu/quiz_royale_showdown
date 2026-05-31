import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mock state ────────────────────────────────────────────────────────

const { mockNavigate, mockApiPost, mockSocketConnect, mockIsConnected, mockAuthState } =
  vi.hoisted(() => {
    const authState = {
      user: {
        id: 'u1',
        displayName: 'Alice',
        username: 'alice',
        email: 'alice@example.com',
        level: 3,
        xp: 0,
        coins: 0,
      } as { id: string; displayName: string; username: string; email: string; level: number; xp: number; coins: number } | null,
      accessToken: 'tok123' as string | null,
      clearAuth: vi.fn(),
    };
    return {
      mockNavigate: vi.fn(),
      mockApiPost: vi.fn(),
      mockSocketConnect: vi.fn(),
      mockIsConnected: vi.fn(() => false),
      mockAuthState: authState,
    };
  });

// ─── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@stores/authStore', () => ({
  useAuthStore: (
    selector: (s: typeof mockAuthState) => unknown,
  ) => selector(mockAuthState),
}));

vi.mock('@services/apiClient', () => ({
  api: { post: mockApiPost },
}));

vi.mock('@services/socketService', () => ({
  socketService: {
    connect: mockSocketConnect,
    isConnected: mockIsConnected,
    emit: vi.fn(),
    disconnect: vi.fn(),
  },
}));

vi.mock('@components/PlayerAvatar', () => ({
  PlayerAvatar: ({ username }: { username?: string; size?: string }) => (
    <span data-testid="player-avatar">{username ?? ''}</span>
  ),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import HomePage from '../HomePage';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockIsConnected.mockReturnValue(false);
  mockAuthState.user = {
    id: 'u1',
    displayName: 'Alice',
    username: 'alice',
    email: 'alice@example.com',
    level: 3,
    xp: 0,
    coins: 0,
  };
  mockAuthState.accessToken = 'tok123';
});

describe('HomePage', () => {
  it('renders navigation buttons (Leaderboard and Friends)', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /leaderboard/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /friends/i })).toBeInTheDocument();
  });

  it('renders the Quick Play and Create Private Room buttons', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /quick play/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create private room/i })).toBeInTheDocument();
  });

  it('clicking Leaderboard navigates to /leaderboard', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /leaderboard/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/leaderboard');
  });

  it('clicking Friends navigates to /friends', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /friends/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/friends');
  });

  it('join-by-code: entering a 6-char code and clicking Join navigates to lobby', async () => {
    mockApiPost.mockResolvedValue({ data: { room: { roomId: 'rid-1', code: 'ABC123' } } });
    renderPage();

    const input = screen.getByPlaceholderText(/room code/i);
    await userEvent.type(input, 'ABC123');
    await userEvent.click(screen.getByRole('button', { name: /^join$/i }));

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/lobby/ABC123'),
    );
  });

  it('join-by-code: shows error when room code is fewer than 6 characters', async () => {
    renderPage();
    const input = screen.getByPlaceholderText(/room code/i);
    await userEvent.type(input, 'AB');
    // The Join button is disabled when length !== 6, so we trigger goToLobby via the button
    // which won't fire while disabled. Verify the button remains disabled.
    const joinBtn = screen.getByRole('button', { name: /^join$/i });
    expect(joinBtn).toBeDisabled();
  });

  it('shows loading state (disabled buttons) while room is being created/joined', async () => {
    // Delay the API response so we can inspect the in-flight state
    let resolve!: (v: unknown) => void;
    mockApiPost.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /quick play/i }));

    // While the request is pending, buttons should be disabled
    expect(screen.getByRole('button', { name: /quick play/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /create private room/i })).toBeDisabled();

    // Resolve and clean up
    resolve({ data: { room: { roomId: 'r1', code: 'QWERTY' } } });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
  });

  it('calls socketService.connect when Quick Play triggers a join and socket is not connected', async () => {
    mockIsConnected.mockReturnValue(false);
    mockApiPost.mockResolvedValue({ data: { room: { roomId: 'r1', code: 'QWERTY' } } });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /quick play/i }));
    await waitFor(() => expect(mockSocketConnect).toHaveBeenCalledWith('tok123'));
  });

  it('does NOT call socketService.connect when socket is already connected', async () => {
    mockIsConnected.mockReturnValue(true);
    mockApiPost.mockResolvedValue({ data: { room: { roomId: 'r1', code: 'QWERTY' } } });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /quick play/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(mockSocketConnect).not.toHaveBeenCalled();
  });

  it('shows an error message when Quick Play API call fails', async () => {
    mockApiPost.mockRejectedValue(new Error('Unable to find a match.'));
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /quick play/i }));
    expect(await screen.findByText(/unable to find a match/i)).toBeInTheDocument();
  });
});
