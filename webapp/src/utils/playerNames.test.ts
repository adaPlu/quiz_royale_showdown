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
});
