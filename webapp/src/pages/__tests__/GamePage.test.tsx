import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mock state ────────────────────────────────────────────────────────

const {
  mockEmit,
  mockOn,
  mockSetActiveRoom,
  mockPlayCorrect,
  mockPlayWrong,
  mockPlayTick,
  mockPlayElimination,
  mockPlayVictory,
  mockPlayPowerup,
  mockGameStoreState,
  mockNavigate,
} = vi.hoisted(() => {
  const defaultState = {
    phase: 'WAITING' as string,
    question: null as null | {
      roundId: string;
      questionId: string;
      prompt: string;
      answers: string[];
      timeLimitMs: number;
      startedAt: string;
    },
    result: null as null | { correctAnswerIndex: number; rankings: unknown[] },
    myAnswerIndex: null as number | null,
    roundNumber: 1,
    totalRounds: 10,
    players: [] as unknown[],
    hostId: null as string | null,
    fiftyFiftyEliminated: [] as number[],
    revealedOptionIndex: null as number | null,
    usedPowerUps: [] as string[],
    levelUpQueue: [] as Array<{ userId: string; newLevel: number; xpAwarded: number; xpToNextLevel: number }>,
    lootDrop: null as null | { powerupType: string; ts: number },
    setMyAnswer: vi.fn(),
    clearLootDrop: vi.fn(),
    dismissLevelUp: vi.fn(),
    clearSocketError: vi.fn(),
    roomId: 'room-123' as string | null,
    socketError: null as string | null,
    activePowerupEffect: null as null | { effectType: string; affectedPlayerIds: string[] },
  };

  return {
    mockEmit: vi.fn(),
    mockOn: vi.fn(() => vi.fn()),
    mockSetActiveRoom: vi.fn(),
    mockPlayCorrect: vi.fn(),
    mockPlayWrong: vi.fn(),
    mockPlayTick: vi.fn(),
    mockPlayElimination: vi.fn(),
    mockPlayVictory: vi.fn(),
    mockPlayPowerup: vi.fn(),
    mockGameStoreState: defaultState,
    mockNavigate: vi.fn(),
  };
});

// ─── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/useGameSocket', () => ({
  useGameSocket: vi.fn(),
}));

vi.mock('@/hooks/useGameAudio', () => ({
  useGameAudio: () => ({
    playCorrect: mockPlayCorrect,
    playWrong: mockPlayWrong,
    playTick: mockPlayTick,
    playElimination: mockPlayElimination,
    playVictory: mockPlayVictory,
    playPowerup: mockPlayPowerup,
  }),
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
  useAuthStore: (selector: (s: { user: { id: string; username: string; displayName: string } }) => unknown) =>
    selector({ user: { id: 'u1', username: 'Alice', displayName: 'Alice' } }),
}));

vi.mock('@/stores/profileStore', () => ({
  useProfileStore: (selector: (s: { powerupInventory: Record<string, number> }) => unknown) =>
    selector({
      powerupInventory: {
        fifty_fifty: 0,
        shield: 0,
        time_boost: 0,
        reveal: 0,
        second_chance: 0,
      },
    }),
}));

vi.mock('@/stores/gameStore', () => ({
  useGameStore: (selector: (s: typeof mockGameStoreState) => unknown) =>
    selector(mockGameStoreState),
}));

// Mock heavy visual sub-components
vi.mock('@/components/PlayerAvatar', () => ({
  PlayerAvatar: ({ player }: { player?: { displayName: string } }) => (
    <span data-testid="player-avatar">{player?.displayName ?? ''}</span>
  ),
}));

vi.mock('@/components/LevelUpToast', () => ({
  LevelUpToast: ({ level }: { level: number | null }) =>
    level !== null ? <div data-testid="level-up-toast">Level {level}</div> : null,
}));

vi.mock('@/components/LootDropToast', () => ({
  LootDropToast: () => null,
}));

vi.mock('@/components/PowerUpActivationFx', () => ({
  PowerUpActivationFx: () => null,
}));

vi.mock('@/components/CountdownBar', () => ({
  CountdownBar: () => <div data-testid="countdown-bar" />,
}));

vi.mock('@/components/PowerUpTray', () => ({
  PowerUpTray: () => null,
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
    button: ({
      children,
      className,
      onClick,
      disabled,
    }: {
      children: React.ReactNode;
      className?: string;
      onClick?: () => void;
      disabled?: boolean;
    }) => (
      <button className={className} onClick={onClick} disabled={disabled}>
        {children}
      </button>
    ),
  },
}));

// ─── Import GamePage after all mocks are registered ───────────────────────────

import { GamePage } from '../GamePage';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setGameState(overrides: Partial<typeof mockGameStoreState>) {
  Object.assign(mockGameStoreState, overrides);
}

function resetGameState() {
  Object.assign(mockGameStoreState, {
    phase: 'WAITING',
    question: null,
    result: null,
    myAnswerIndex: null,
    roundNumber: 1,
    totalRounds: 10,
    players: [],
    hostId: null,
    fiftyFiftyEliminated: [],
    revealedOptionIndex: null,
    usedPowerUps: [],
    levelUpQueue: [],
    lootDrop: null,
    setMyAnswer: vi.fn(),
    clearLootDrop: vi.fn(),
    dismissLevelUp: vi.fn(),
    clearSocketError: vi.fn(),
    roomId: 'room-123',
    socketError: null,
    activePowerupEffect: null,
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/game/room-123']}>
      <Routes>
        <Route path="/game/:roomId" element={<GamePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockOn.mockReturnValue(vi.fn());
  resetGameState();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GamePage smoke tests', () => {
  it('renders waiting state when phase is WAITING', () => {
    setGameState({ phase: 'WAITING', question: null, players: [] });
    renderPage();

    // The page header shows "Waiting for host" (u1 is not host since hostId is null)
    expect(screen.getByText(/waiting for host/i)).toBeInTheDocument();
    // Player count area shows the empty-state message
    expect(screen.getByText(/no players synced yet/i)).toBeInTheDocument();
  });

  it('renders answer buttons when question is active', () => {
    const question = {
      roundId: 'r1',
      questionId: 'q1',
      prompt: 'What is the capital of France?',
      answers: ['Berlin', 'Paris', 'London', 'Madrid'],
      timeLimitMs: 15000,
      startedAt: new Date().toISOString(),
    };
    setGameState({ phase: 'QUESTION_ACTIVE', question, players: [] });
    renderPage();

    expect(screen.getByText('Berlin')).toBeInTheDocument();
    expect(screen.getByText('Paris')).toBeInTheDocument();
    expect(screen.getByText('London')).toBeInTheDocument();
    expect(screen.getByText('Madrid')).toBeInTheDocument();
  });

  it('highlights correct answer on ROUND_RESULT', () => {
    const question = {
      roundId: 'r1',
      questionId: 'q1',
      prompt: 'Pick the correct one',
      answers: ['Wrong 1', 'Wrong 2', 'Correct Answer', 'Wrong 3'],
      timeLimitMs: 15000,
      startedAt: new Date().toISOString(),
    };
    const result = { correctAnswerIndex: 2, rankings: [] };
    setGameState({
      phase: 'ROUND_RESULT',
      question,
      result,
      players: [],
    });
    renderPage();

    // The correct answer text should be rendered
    expect(screen.getByText('Correct Answer')).toBeInTheDocument();
    // The result panel showing "Correct answer: C" (index 2 = label C)
    expect(screen.getByText(/correct answer: C/i)).toBeInTheDocument();
  });

  it('shows level-up toast when levelUpQueue has entry', () => {
    setGameState({
      phase: 'WAITING',
      question: null,
      players: [],
      levelUpQueue: [{ userId: 'u1', newLevel: 5, xpAwarded: 200, xpToNextLevel: 400 }],
    });
    renderPage();

    expect(screen.getByTestId('level-up-toast')).toBeInTheDocument();
    expect(screen.getByText(/level 5/i)).toBeInTheDocument();
  });
});

describe('GamePage — socket error banner', () => {
  it('renders alert banner when socketError is set', () => {
    setGameState({ socketError: 'Room is full' });
    renderPage();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Room is full');
  });

  it('auto-dismisses after 4000ms by calling clearSocketError', async () => {
    vi.useFakeTimers();
    const clearSocketError = vi.fn();
    setGameState({ socketError: 'Room is full', clearSocketError });
    renderPage();

    // Banner should be visible
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Advance timers past the 4-second auto-dismiss
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    expect(clearSocketError).toHaveBeenCalled();
  });

  it('does not render alert banner when socketError is null', () => {
    setGameState({ socketError: null });
    renderPage();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('GamePage — answer buttons for active question', () => {
  const makeQuestion = (answers = ['Alpha', 'Beta', 'Gamma', 'Delta']) => ({
    roundId: 'r1',
    questionId: 'q1',
    prompt: 'Test question?',
    answers,
    timeLimitMs: 20000,
    startedAt: new Date().toISOString(),
  });

  it('renders 4 answer buttons labeled A / B / C / D', () => {
    setGameState({ phase: 'QUESTION_ACTIVE', question: makeQuestion() });
    renderPage();

    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.getByText('D')).toBeInTheDocument();
  });

  it('calls socketService.emit with round:submit_answer and correct answerIndex on click', async () => {
    const question = makeQuestion(['Option A', 'Option B', 'Option C', 'Option D']);
    setGameState({ phase: 'QUESTION_ACTIVE', question, myAnswerIndex: null });
    renderPage();

    // Click the second answer button (index 1 = "B" label, "Option B" text)
    const optionBButton = screen.getByText('Option B').closest('button') as HTMLElement;
    await userEvent.click(optionBButton);

    expect(mockEmit).toHaveBeenCalledWith(
      'round:submit_answer',
      expect.objectContaining({
        roomId: expect.any(String),
        questionId: question.questionId,
        answerIndex: 1,
        clientSentAt: expect.any(String),
      }),
    );
  });
});

describe('GamePage — correct answer highlighting', () => {
  it('applies correct-answer class to the button at result.correctAnswerIndex', () => {
    const question = {
      roundId: 'r1',
      questionId: 'q1',
      prompt: 'Who wrote Hamlet?',
      answers: ['Marlowe', 'Shakespeare', 'Chaucer', 'Donne'],
      timeLimitMs: 15000,
      startedAt: new Date().toISOString(),
    };
    // correctAnswerIndex = 1 → "Shakespeare"
    setGameState({
      phase: 'ROUND_RESULT',
      question,
      result: { correctAnswerIndex: 1, rankings: [] },
      myAnswerIndex: null,
    });
    renderPage();

    const correctButton = screen.getByText('Shakespeare').closest('button') as HTMLElement;
    // answerButtonClass returns 'border-answer-correct ...' for the correct index
    expect(correctButton.className).toMatch(/border-answer-correct/);
  });
});

describe('GamePage — leave button confirmation', () => {
  it('calls window.confirm when leaving during an active phase', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    setGameState({ phase: 'QUESTION_ACTIVE', question: null });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /← back/i }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/leave the game/i));
    confirmSpy.mockRestore();
  });

  it('does NOT navigate when the user cancels the leave confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    setGameState({ phase: 'QUESTION_ACTIVE', question: null });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /← back/i }));

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('navigates to /home when user confirms leave', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setGameState({ phase: 'QUESTION_ACTIVE', question: null });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /← back/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/home');
  });
});

describe('GamePage — leaderboard sorted by score', () => {
  it('renders players in descending score order', () => {
    setGameState({
      phase: 'WAITING',
      players: [
        { id: 'p1', displayName: 'Alice', score: 100, streak: 0, isEliminated: false },
        { id: 'p2', displayName: 'Charlie', score: 300, streak: 0, isEliminated: false },
        { id: 'p3', displayName: 'Bob', score: 200, streak: 0, isEliminated: false },
      ],
    });
    renderPage();

    const avatars = screen.getAllByTestId('player-avatar');
    // The leaderboard is sorted desc: Charlie (300), Bob (200), Alice (100)
    expect(avatars[0]).toHaveTextContent('Charlie');
    expect(avatars[1]).toHaveTextContent('Bob');
    expect(avatars[2]).toHaveTextContent('Alice');
  });
});

describe('GamePage — host start game', () => {
  it('shows "Start Game" button when user is host in WAITING phase', () => {
    setGameState({ phase: 'WAITING', hostId: 'u1' });
    renderPage();

    expect(screen.getByRole('button', { name: /start game/i })).toBeInTheDocument();
  });

  it('does NOT show "Start Game" when user is not the host', () => {
    setGameState({ phase: 'WAITING', hostId: 'other-user' });
    renderPage();

    expect(screen.queryByRole('button', { name: /start game/i })).toBeNull();
  });

  it('clicking "Start Game" emits room:start with the roomId', async () => {
    setGameState({ phase: 'WAITING', hostId: 'u1', roomId: 'room-123' });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /start game/i }));

    expect(mockEmit).toHaveBeenCalledWith('room:start', { roomId: 'room-123' });
  });
});
