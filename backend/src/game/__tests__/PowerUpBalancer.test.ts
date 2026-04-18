import { describe, expect, it } from 'vitest';

import { runPowerUpBalanceSweep } from '../PowerUpBalancer';

describe('PowerUpBalancer', () => {
  const config = {
    seed: 99,
    matches: 200,
    questionsPerMatch: 10,
    timeLimitMs: 5_000,
    targetPlayerId: 'hero',
    players: [
      { id: 'hero', baseCorrectRate: 0.65, baseAnswerTimeMs: 2_200 },
      { id: 'rival-a', baseCorrectRate: 0.62, baseAnswerTimeMs: 2_300 },
      { id: 'rival-b', baseCorrectRate: 0.6, baseAnswerTimeMs: 2_350 },
    ],
    powerUps: [
      { id: 'focus', accuracyDelta: 0.05, answerTimeDeltaMs: -100 },
      { id: 'overclock', accuracyDelta: 0.1, answerTimeDeltaMs: -200, scoreMultiplier: 1.05 },
    ],
  } as const;

  it('produces deterministic sweep results', () => {
    const first = runPowerUpBalanceSweep(config);
    const second = runPowerUpBalanceSweep(config);

    expect(second).toEqual(first);
  });

  it('reports deltas against the baseline scenario', () => {
    const result = runPowerUpBalanceSweep(config);
    const focus = result.powerUps.find((entry) => entry.id === 'focus');
    const overclock = result.powerUps.find((entry) => entry.id === 'overclock');

    expect(result.baseline.id).toBe('baseline');
    expect(focus?.scoreDeltaVsBaseline).toBeGreaterThan(0);
    expect(overclock?.scoreDeltaVsBaseline).toBeGreaterThan(focus?.scoreDeltaVsBaseline ?? 0);
    expect(overclock?.winRateDeltaVsBaseline).toBeGreaterThanOrEqual(0);
  });
});
