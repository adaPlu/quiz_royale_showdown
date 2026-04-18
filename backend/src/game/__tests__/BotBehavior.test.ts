import { describe, expect, it } from 'vitest';

import { getBotCorrectRate, simulateBotAnswer } from '../BotBehavior';

describe('BotBehavior', () => {
  it('returns the configured target correct rates', () => {
    expect(getBotCorrectRate('easy')).toBe(0.4);
    expect(getBotCorrectRate('medium')).toBe(0.65);
    expect(getBotCorrectRate('hard')).toBe(0.85);
  });

  it('is deterministic for the same seed and prompt inputs', () => {
    const first = simulateBotAnswer({
      botDifficulty: 'medium',
      botId: 'bot-a',
      questionIndex: 7,
      timeLimitMs: 5_000,
      seed: 42,
    });
    const second = simulateBotAnswer({
      botDifficulty: 'medium',
      botId: 'bot-a',
      questionIndex: 7,
      timeLimitMs: 5_000,
      seed: 42,
    });

    expect(second).toEqual(first);
  });

  it('tracks the expected long-run correctness curve by difficulty', () => {
    const samples = 2_000;
    const observed = {
      easy: 0,
      medium: 0,
      hard: 0,
    };

    for (let sample = 0; sample < samples; sample += 1) {
      if (
        simulateBotAnswer({
          botDifficulty: 'easy',
          botId: 'bot-easy',
          questionIndex: sample,
          timeLimitMs: 5_000,
          seed: 100,
        }).isCorrect
      ) {
        observed.easy += 1;
      }

      if (
        simulateBotAnswer({
          botDifficulty: 'medium',
          botId: 'bot-medium',
          questionIndex: sample,
          timeLimitMs: 5_000,
          seed: 100,
        }).isCorrect
      ) {
        observed.medium += 1;
      }

      if (
        simulateBotAnswer({
          botDifficulty: 'hard',
          botId: 'bot-hard',
          questionIndex: sample,
          timeLimitMs: 5_000,
          seed: 100,
        }).isCorrect
      ) {
        observed.hard += 1;
      }
    }

    expect(observed.easy / samples).toBeCloseTo(0.4, 1);
    expect(observed.medium / samples).toBeCloseTo(0.65, 1);
    expect(observed.hard / samples).toBeCloseTo(0.85, 1);
  });
});
