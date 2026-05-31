import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockEmit } = vi.hoisted(() => ({
  mockEmit: vi.fn(),
}));

// ─── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/services/socketService', () => ({
  socketService: {
    emit: mockEmit,
    on: vi.fn(() => vi.fn()),
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: vi.fn(() => false),
    setActiveRoom: vi.fn(),
  },
}));

// Stub framer-motion so motion.button renders a plain button
vi.mock('framer-motion', () => ({
  motion: {
    button: ({
      children,
      className,
      onClick,
      disabled,
      title,
      'aria-label': ariaLabel,
      'aria-pressed': ariaPressed,
    }: {
      children: React.ReactNode;
      className?: string;
      onClick?: () => void;
      disabled?: boolean;
      title?: string;
      'aria-label'?: string;
      'aria-pressed'?: boolean;
    }) => (
      <button
        className={className}
        onClick={onClick}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        aria-pressed={ariaPressed}
        // aria-disabled mirrors the disabled prop for the test assertions
        aria-disabled={disabled}
      >
        {children}
      </button>
    ),
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { PowerUpTray, type PowerUpSlot } from '../PowerUpTray';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ALL_SLOT_TYPES: PowerUpSlot['type'][] = [
  'fifty_fifty',
  'shield',
  'time_boost',
  'reveal_wrong',
  'second_chance',
];

function makeSlot(overrides: Partial<PowerUpSlot> & { type: PowerUpSlot['type'] }): PowerUpSlot {
  return { owned: true, used: false, count: 1, ...overrides };
}

function makeAllOwnedSlots(): PowerUpSlot[] {
  return ALL_SLOT_TYPES.map((type) => makeSlot({ type }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PowerUpTray', () => {
  it('renders all 5 power-up slots', () => {
    render(<PowerUpTray slots={makeAllOwnedSlots()} roomId="room-1" />);
    // Each slot renders a button; framer-motion.button is stubbed to a plain button.
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(5);
  });

  it('disabled slot (not owned) has aria-disabled=true', () => {
    const slots: PowerUpSlot[] = [
      makeSlot({ type: 'fifty_fifty', owned: false }),
      ...ALL_SLOT_TYPES.slice(1).map((type) => makeSlot({ type })),
    ];
    render(<PowerUpTray slots={slots} roomId="room-1" />);

    // The first button (fifty_fifty) is not owned, so it is disabled.
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveAttribute('aria-disabled', 'true');
    // Other buttons (owned & unused) should NOT be aria-disabled
    expect(buttons[1]).toHaveAttribute('aria-disabled', 'false');
  });

  it('clicking an owned, unused power-up emits powerup:activate', async () => {
    render(<PowerUpTray slots={makeAllOwnedSlots()} roomId="room-1" />);
    const buttons = screen.getAllByRole('button');
    // Click the first slot (fifty_fifty) — it is owned and not used
    await userEvent.click(buttons[0]);
    expect(mockEmit).toHaveBeenCalledOnce();
    expect(mockEmit).toHaveBeenCalledWith('powerup:activate', {
      roomId: 'room-1',
      powerUpId: 'fifty_fifty',
    });
  });

  it('clicking a used power-up does NOT emit powerup:activate', async () => {
    const slots: PowerUpSlot[] = ALL_SLOT_TYPES.map((type) =>
      makeSlot({ type, used: type === 'shield' }),
    );
    render(<PowerUpTray slots={slots} roomId="room-1" />);

    const buttons = screen.getAllByRole('button');
    // shield is at index 1 and is marked used → button is disabled
    await userEvent.click(buttons[1]);
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('clicking when disabled=true prop is set does NOT emit', async () => {
    render(<PowerUpTray slots={makeAllOwnedSlots()} roomId="room-1" disabled={true} />);
    const buttons = screen.getAllByRole('button');
    // All slots are disabled due to the tray-level disabled prop
    for (const btn of buttons) {
      expect(btn).toBeDisabled();
    }
    await userEvent.click(buttons[0]);
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('used slot shows "USED" overlay text', () => {
    const slots: PowerUpSlot[] = ALL_SLOT_TYPES.map((type) =>
      makeSlot({ type, used: type === 'time_boost' }),
    );
    render(<PowerUpTray slots={slots} roomId="room-1" />);
    expect(screen.getByText('USED')).toBeInTheDocument();
  });

  it('slot with count > 1 renders a count badge', () => {
    const slots: PowerUpSlot[] = [makeSlot({ type: 'fifty_fifty', count: 3 })];
    render(<PowerUpTray slots={slots} roomId="room-1" />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
