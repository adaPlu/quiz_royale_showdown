import type { QuestionDifficulty } from './types';

export const BOT_CORRECT_RATES: Readonly<Record<QuestionDifficulty, number>> = {
  easy: 0.4,
  medium: 0.65,
  hard: 0.85,
};

export interface BotDecisionInput {
  botDifficulty: QuestionDifficulty;
  botId: string;
  questionIndex: number;
  timeLimitMs: number;
  seed: number;
}

export interface BotDecision {
  isCorrect: boolean;
  answerTimeMs: number;
  correctRate: number;
  roll: number;
}

export function getBotCorrectRate(botDifficulty: QuestionDifficulty): number {
  return BOT_CORRECT_RATES[botDifficulty];
}

export function simulateBotAnswer(input: BotDecisionInput): BotDecision {
  if (input.timeLimitMs <= 0) {
    throw new Error('timeLimitMs must be positive');
  }

  const rng = createRng(hashSeed(input.seed, input.botId, input.questionIndex));
  const correctRate = getBotCorrectRate(input.botDifficulty);
  const roll = rng();
  const answerTimeRatio = baseTimeRatio(input.botDifficulty) + (rng() - 0.5) * 0.2;

  return {
    isCorrect: roll < correctRate,
    answerTimeMs: Math.round(clamp(answerTimeRatio, 0.2, 0.98) * input.timeLimitMs),
    correctRate,
    roll,
  };
}

function baseTimeRatio(botDifficulty: QuestionDifficulty): number {
  switch (botDifficulty) {
    case 'easy':
      return 0.82;
    case 'medium':
      return 0.64;
    case 'hard':
      return 0.48;
    default: {
      const neverReached: never = botDifficulty;
      throw new Error(`Unsupported bot difficulty: ${neverReached}`);
    }
  }
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function hashSeed(seed: number, botId: string, questionIndex: number): number {
  let hash = (2166136261 ^ seed) >>> 0;

  for (let index = 0; index < botId.length; index += 1) {
    hash ^= botId.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  hash ^= questionIndex >>> 0;
  hash = Math.imul(hash, 16777619) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0x5bd1e995) >>> 0;
  return (hash ^ (hash >>> 15)) >>> 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
