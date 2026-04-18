import { describe, expect, it } from 'vitest';

import { calculateStreakMultiplier, scoreAnswer } from '../ScoringEngine';

describe('ScoringEngine', () => {
  it('scores a correct answer from the requested time penalty formula', () => {
    const result = scoreAnswer({
      isCorrect: true,
      answerTimeMs: 2_500,
      timeLimitMs: 5_000,
      currentStreak: 0,
    });

    expect(result.speedScore).toBe(800);
    expect(result.streakMultiplier).toBe(1);
    expect(result.awardedScore).toBe(800);
    expect(result.nextStreak).toBe(1);
  });

  it('applies a capped streak multiplier to consecutive correct answers', () => {
    const result = scoreAnswer({
      isCorrect: true,
      answerTimeMs: 500,
      timeLimitMs: 5_000,
      currentStreak: 5,
    });

    expect(calculateStreakMultiplier(6)).toBe(1.5);
    expect(result.streakMultiplier).toBe(1.5);
    expect(result.awardedScore).toBe(1440);
    expect(result.nextStreak).toBe(6);
  });

  it('zeros score and resets streak on an incorrect answer', () => {
    const result = scoreAnswer({
      isCorrect: false,
      answerTimeMs: 500,
      timeLimitMs: 5_000,
      currentStreak: 3,
    });

    expect(result).toEqual({
      awardedScore: 0,
      speedScore: 0,
      speedPenalty: 0,
      streakMultiplier: 1,
      nextStreak: 0,
    });
  });
});
