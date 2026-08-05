import { describe, expect, it } from 'vitest';

import { buildAutoPlayerName, resolvePlayerName } from './playerNames';

describe('player name fallbacks', () => {
  it('creates a stable userID### name', () => {
    const playerId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    const generatedName = buildAutoPlayerName(playerId);

    expect(generatedName).toMatch(/^userID\d{3}$/);
    expect(generatedName).toBe(buildAutoPlayerName(playerId));
    expect(generatedName).not.toContain(playerId);
  });

  it('uses a real display name when present', () => {
    expect(resolvePlayerName('  Adam  ', 'player-id')).toBe('Adam');
  });

  it('replaces internal ID-shaped display names', () => {
    expect(
      resolvePlayerName(
        '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      ),
    ).toMatch(/^userID\d{3}$/);
    expect(
      resolvePlayerName('29021eeb02befe3b4372a964d283a4d7', 'player-id'),
    ).toMatch(/^userID\d{3}$/);
  });
});
