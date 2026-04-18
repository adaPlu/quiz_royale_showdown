import { describe, expect, it } from 'vitest';

import { calculateMatchXp } from '../XPFormula';

describe('XPFormula', () => {
  it('matches the approved handoff formula with win bonus and streak scaling', () => {
    const winnerXp = calculateMatchXp({
      placement: 1,
      totalPlayers: 10,
      streakWins: 5,
    });
    const lowerPlacementXp = calculateMatchXp({
      placement: 8,
      totalPlayers: 10,
      streakWins: 1,
    });

    expect(winnerXp).toBe(925);
    expect(lowerPlacementXp).toBe(185);
    expect(winnerXp).toBeGreaterThan(lowerPlacementXp);
  });

  it('supports solo practice with the same base formula', () => {
    expect(
      calculateMatchXp({
        placement: 1,
        totalPlayers: 1,
        streakWins: 4,
      }),
    ).toBe(900);
  });
});
