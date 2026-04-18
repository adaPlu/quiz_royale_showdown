import { describe, expect, it } from 'vitest';

import { eliminateBottomN } from '../EliminationEngine';

describe('EliminationEngine', () => {
  it('eliminates the bottom N players with deterministic tie-breaks', () => {
    const result = eliminateBottomN(
      [
        { playerId: 'amy', roundScore: 800, totalScore: 2_500, answerTimeMs: 2_100 },
        { playerId: 'ben', roundScore: 600, totalScore: 2_200, answerTimeMs: 4_000 },
        { playerId: 'cy', roundScore: 600, totalScore: 2_400, answerTimeMs: 4_400 },
        { playerId: 'dee', roundScore: 950, totalScore: 2_800, answerTimeMs: 1_700 },
      ],
      { eliminateCount: 2 },
    );

    expect(result.eliminated.map((player) => player.playerId)).toEqual(['ben', 'cy']);
    expect(result.survivors.map((player) => player.playerId)).toEqual(['dee', 'amy']);
  });

  it('respects minimum survivors and protected players', () => {
    const result = eliminateBottomN(
      [
        { playerId: 'amy', roundScore: 100, totalScore: 400 },
        { playerId: 'ben', roundScore: 90, totalScore: 300 },
        { playerId: 'cy', roundScore: 80, totalScore: 200 },
      ],
      {
        eliminateCount: 2,
        minimumSurvivors: 2,
        protectedPlayerIds: ['cy'],
      },
    );

    expect(result.actualEliminationCount).toBe(1);
    expect(result.eliminated.map((player) => player.playerId)).toEqual(['ben']);
    expect(result.survivors.map((player) => player.playerId)).toEqual(['amy', 'cy']);
  });
});
