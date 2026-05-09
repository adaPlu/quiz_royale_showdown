import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const { mockResetRoom, mockFinalScores } = vi.hoisted(() => ({
  mockResetRoom: vi.fn(),
  mockFinalScores: [] as Array<{ playerId: string; rank: number; score: number; xpAwarded: number }>,
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string; username: string; displayName: string } | null }) => unknown) =>
    selector({ user: { id: 'u1', username: 'Alice', displayName: 'Alice' } }),
}));

vi.mock('@/stores/gameStore', () => ({
  useGameStore: (
    selector: (s: {
      finalScores: typeof mockFinalScores;
      winnerId: string | null;
      resetRoom: typeof mockResetRoom;
    }) => unknown,
  ) =>
    selector({
      finalScores: mockFinalScores,
      winnerId: null,
      resetRoom: mockResetRoom,
    }),
}));

// Mock PlayerAvatar — ResultsPage uses @components alias
vi.mock('@components/PlayerAvatar', () => ({
  PlayerAvatar: ({ username }: { username: string }) => (
    <span data-testid="player-avatar">{username}</span>
  ),
}));

// Mock framer-motion to avoid animation side effects
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
  },
}));

import ResultsPage from '../ResultsPage';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/results/room-123']}>
      <Routes>
        <Route path="/results/:roomId" element={<ResultsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockFinalScores.length = 0;
});

describe('ResultsPage', () => {
  it('shows "No results available" when finalScores is empty', () => {
    renderPage();
    expect(screen.getByText(/no results available/i)).toBeInTheDocument();
  });

  it('renders player rows when finalScores has entries', () => {
    mockFinalScores.push(
      { playerId: 'player-1', rank: 1, score: 3000, xpAwarded: 100 },
      { playerId: 'player-2', rank: 2, score: 2000, xpAwarded: 50 },
    );

    renderPage();

    // Each playerId appears in both PlayerAvatar mock and the row text span
    expect(screen.getAllByText('player-1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('player-2').length).toBeGreaterThan(0);
  });

  it('highlights the winner via Final Standings section', () => {
    mockFinalScores.push(
      { playerId: 'winner-id', rank: 1, score: 5000, xpAwarded: 200 },
      { playerId: 'loser-id', rank: 2, score: 1000, xpAwarded: 20 },
    );

    renderPage();

    expect(screen.getByText('Final Standings')).toBeInTheDocument();
    // Rank #1 row is present
    expect(screen.getByText('#1')).toBeInTheDocument();
    // winner-id appears at least in the row text span
    expect(screen.getAllByText('winner-id').length).toBeGreaterThan(0);
  });

  it('"Back to Lobby" / Home button navigates to /home', async () => {
    mockFinalScores.push(
      { playerId: 'p1', rank: 1, score: 100, xpAwarded: 0 },
    );

    renderPage();

    // There are two navigation buttons: "Home" and "Play Again"
    // Click the first one labelled "Home"
    const buttons = screen.getAllByRole('button');
    const homeBtn = buttons.find((btn) => btn.textContent === 'Home');
    expect(homeBtn).toBeDefined();
    await userEvent.click(homeBtn!);

    // After navigation to /home (no matching route) page unmounts — h2 is gone
    expect(screen.queryByText('Final Standings')).not.toBeInTheDocument();
  });
});
