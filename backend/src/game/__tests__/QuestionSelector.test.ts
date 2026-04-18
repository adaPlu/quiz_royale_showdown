import { describe, expect, it } from 'vitest';

import {
  buildDifficultyCurve,
  getTargetDifficulty,
  selectQuestion,
} from '../QuestionSelector';

describe('QuestionSelector', () => {
  it('builds an easy-to-hard difficulty curve', () => {
    expect(buildDifficultyCurve(2, 3)).toEqual([
      'easy',
      'easy',
      'medium',
      'medium',
      'hard',
      'hard',
    ]);
    expect(getTargetDifficulty(2, 3, 2, 3)).toBe('hard');
  });

  it('avoids questions used within the anti-repeat window when alternatives exist', () => {
    const nowMs = Date.UTC(2026, 3, 18);
    const result = selectQuestion(
      [
        { id: 'easy-recent', difficulty: 'easy', lastUsedAtMs: nowMs - 5 * 24 * 60 * 60 * 1000 },
        { id: 'easy-old', difficulty: 'easy', lastUsedAtMs: nowMs - 45 * 24 * 60 * 60 * 1000 },
        { id: 'medium-old', difficulty: 'medium', lastUsedAtMs: nowMs - 60 * 24 * 60 * 60 * 1000 },
      ],
      {
        round: 1,
        question: 1,
        totalRounds: 3,
        questionsPerRound: 3,
        nowMs,
      },
    );

    expect(result.targetDifficulty).toBe('easy');
    expect(result.question.id).toBe('easy-old');
    expect(result.antiRepeatRespected).toBe(true);
  });

  it('falls back to a repeated or adjacent difficulty when the target bucket is exhausted', () => {
    const nowMs = Date.UTC(2026, 3, 18);
    const result = selectQuestion(
      [
        { id: 'hard-recent', difficulty: 'hard', lastUsedAtMs: nowMs - 5 * 24 * 60 * 60 * 1000 },
        { id: 'medium-old', difficulty: 'medium', lastUsedAtMs: nowMs - 60 * 24 * 60 * 60 * 1000 },
      ],
      {
        round: 3,
        question: 3,
        totalRounds: 3,
        questionsPerRound: 3,
        nowMs,
      },
    );

    expect(result.targetDifficulty).toBe('hard');
    expect(result.question.id).toBe('medium-old');
    expect(result.antiRepeatRespected).toBe(true);
  });
});
