import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    setMyAnswer: () => {},
    clearLootDrop: () => {},
    dismissLevelUp: () => {},
    roomId: 'room-123' as string | null,
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
  };
});

// ─── Module mocks ──────────────────────────────────────────────────────────────

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
    setMyAnswer: () => {},
    clearLootDrop: () => {},
    dismissLevelUp: () => {},
    roomId: 'room-123',
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

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockOn.mockReturnValue(vi.fn());
  resetGameState();
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
