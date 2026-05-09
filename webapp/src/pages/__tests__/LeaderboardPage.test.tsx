import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const { apiGet } = vi.hoisted(() => ({
  apiGet: vi.fn(),
}));

vi.mock('@/services/apiClient', () => ({
  api: { get: apiGet, post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string; username: string; displayName: string } }) => unknown) =>
    selector({ user: { id: 'u1', username: 'Alice', displayName: 'Alice' } }),
}));

// Mock PlayerAvatar to avoid complex rendering
vi.mock('@/components/PlayerAvatar', () => ({
  PlayerAvatar: ({ player }: { player: { displayName: string } }) => (
    <span data-testid="player-avatar">{player?.displayName}</span>
  ),
}));

import LeaderboardPage from '../LeaderboardPage';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter>
      <LeaderboardPage />
    </MemoryRouter>,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  apiGet.mockResolvedValue({ data: [] });
});

describe('LeaderboardPage', () => {
  it('renders Season, Global, and Friends tabs', async () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Season' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Global' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Friends' })).toBeInTheDocument();
  });

  it('shows loading spinner while fetching', () => {
    // Never resolve so loading stays true
    apiGet.mockReturnValue(new Promise(() => {}));
    renderPage();
    // The spinner is a div with animate-spin class
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows leaderboard entries from API response on the default Season tab', async () => {
    apiGet.mockResolvedValue({
      data: [
        { rank: 1, userId: 'u2', displayName: 'Bob', mmr: 1500 },
        { rank: 2, userId: 'u3', displayName: 'Carol', mmr: 1400 },
      ],
    });

    renderPage();

    // Both the PlayerAvatar mock and the display-name span render the same text,
    // so use getAllByText and assert at least one match
    await waitFor(() => expect(screen.getAllByText('Bob').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Carol').length).toBeGreaterThan(0);
    expect(screen.getByText('1500 MMR')).toBeInTheDocument();
  });

  it('switches to Friends tab and calls /leaderboard/friends endpoint', async () => {
    apiGet.mockResolvedValue({ data: [] });

    renderPage();

    const friendsTab = screen.getByRole('button', { name: 'Friends' });
    await userEvent.click(friendsTab);

    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith(
        expect.stringContaining('/leaderboard/friends'),
      ),
    );
  });

  it('shows empty-state message when API returns an empty array', async () => {
    apiGet.mockResolvedValue({ data: [] });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/no entries yet/i)).toBeInTheDocument(),
    );
  });
});
