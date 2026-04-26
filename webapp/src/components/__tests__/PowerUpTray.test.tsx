import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { emitMock } = vi.hoisted(() => ({ emitMock: vi.fn() }));

vi.mock('@/services/socketService', () => ({
  socketService: { emit: emitMock },
}));

import { PowerUpTray, type PowerupSlot } from '../PowerUpTray';

const baseSlots: PowerupSlot[] = [
  { type: 'fifty_fifty', owned: true,  used: false },
  { type: 'shield',      owned: false, used: false },
  { type: 'time_boost',  owned: false, used: false },
  { type: 'reveal_wrong', owned: false, used: false },
];

beforeEach(() => vi.clearAllMocks());

describe('PowerUpTray', () => {
  it('renders one button per slot', () => {
    const { getAllByRole } = render(<PowerUpTray slots={baseSlots} roomId="room-1" />);
    expect(getAllByRole('button')).toHaveLength(4);
  });

  it('does not emit when clicking an unowned slot', () => {
    const { getAllByRole } = render(<PowerUpTray slots={baseSlots} roomId="room-1" />);
    fireEvent.click(getAllByRole('button')[1]); // shield — not owned
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('emits powerup:activate with uppercase backend enum on owned slot click', () => {
    const { getAllByRole } = render(<PowerUpTray slots={baseSlots} roomId="room-1" />);
    fireEvent.click(getAllByRole('button')[0]); // fifty_fifty — owned
    expect(emitMock).toHaveBeenCalledWith('powerup:activate', {
      roomId: 'room-1',
      powerUpId: 'FIFTY_FIFTY',
    });
  });

  it('does not emit when the tray is globally disabled', () => {
    const { getAllByRole } = render(
      <PowerUpTray slots={baseSlots} roomId="room-1" disabled />,
    );
    fireEvent.click(getAllByRole('button')[0]); // owned but tray disabled
    expect(emitMock).not.toHaveBeenCalled();
  });
});
