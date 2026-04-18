export const DEFAULT_BASE_SCORE = 1000;
export const DEFAULT_MAX_TIME_PENALTY = 400;
export const DEFAULT_STREAK_STEP = 0.1;
export const DEFAULT_MAX_STREAK_BONUS = 0.5;

export interface ScoreInput {
  isCorrect: boolean;
  answerTimeMs: number;
  timeLimitMs: number;
  currentStreak: number;
  baseScore?: number;
  maxTimePenalty?: number;
  streakStep?: number;
  maxStreakBonus?: number;
}

export interface ScoreResult {
  awardedScore: number;
  speedScore: number;
  speedPenalty: number;
  streakMultiplier: number;
  nextStreak: number;
}

export function calculateStreakMultiplier(
  streakCount: number,
  options: {
    streakStep?: number;
    maxStreakBonus?: number;
  } = {},
): number {
  const step = options.streakStep ?? DEFAULT_STREAK_STEP;
  const maxBonus = options.maxStreakBonus ?? DEFAULT_MAX_STREAK_BONUS;
  const bonus = Math.min(Math.max(0, streakCount - 1) * step, maxBonus);

  return 1 + bonus;
}

export function scoreAnswer(input: ScoreInput): ScoreResult {
  if (input.timeLimitMs <= 0) {
    throw new Error('timeLimitMs must be positive');
  }

  if (!input.isCorrect) {
    return {
      awardedScore: 0,
      speedScore: 0,
      speedPenalty: 0,
      streakMultiplier: 1,
      nextStreak: 0,
    };
  }

  const baseScore = input.baseScore ?? DEFAULT_BASE_SCORE;
  const maxTimePenalty = input.maxTimePenalty ?? DEFAULT_MAX_TIME_PENALTY;
  const clampedAnswerTimeMs = clamp(input.answerTimeMs, 0, input.timeLimitMs);
  const speedPenalty = (clampedAnswerTimeMs / input.timeLimitMs) * maxTimePenalty;
  const speedScore = Math.max(0, Math.round(baseScore - speedPenalty));
  const nextStreak = input.currentStreak + 1;
  const streakMultiplier = calculateStreakMultiplier(nextStreak, {
    streakStep: input.streakStep,
    maxStreakBonus: input.maxStreakBonus,
  });

  return {
    awardedScore: Math.max(0, Math.round(speedScore * streakMultiplier)),
    speedScore,
    speedPenalty,
    streakMultiplier,
    nextStreak,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
