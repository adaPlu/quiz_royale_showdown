import {
  QUESTION_DIFFICULTIES,
  type QuestionCandidate,
  type QuestionDifficulty,
} from './types';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_ANTI_REPEAT_WINDOW_DAYS = 30;

export interface QuestionSelectionContext {
  round: number;
  question: number;
  totalRounds: number;
  questionsPerRound: number;
  nowMs: number;
  antiRepeatWindowDays?: number;
  excludedQuestionIds?: readonly string[];
}

export interface QuestionSelectionResult {
  question: QuestionCandidate;
  targetDifficulty: QuestionDifficulty;
  antiRepeatRespected: boolean;
}

const DIFFICULTY_FALLBACKS: Readonly<Record<QuestionDifficulty, readonly QuestionDifficulty[]>> = {
  easy: ['medium', 'hard'],
  medium: ['hard', 'easy'],
  hard: ['medium', 'easy'],
};

export function buildDifficultyCurve(
  totalRounds: number,
  questionsPerRound: number,
): QuestionDifficulty[] {
  if (totalRounds <= 0 || questionsPerRound <= 0) {
    throw new Error('totalRounds and questionsPerRound must be positive');
  }

  const totalQuestions = totalRounds * questionsPerRound;
  const curve: QuestionDifficulty[] = [];

  for (let index = 0; index < totalQuestions; index += 1) {
    const progress = totalQuestions === 1 ? 1 : index / (totalQuestions - 1);
    curve.push(difficultyFromProgress(progress));
  }

  return curve;
}

export function getTargetDifficulty(
  round: number,
  question: number,
  totalRounds: number,
  questionsPerRound: number,
): QuestionDifficulty {
  if (round <= 0 || question <= 0) {
    throw new Error('round and question must be positive');
  }

  const curve = buildDifficultyCurve(totalRounds, questionsPerRound);
  const index = (round - 1) * questionsPerRound + (question - 1);
  return curve[Math.min(index, curve.length - 1)];
}

export function selectQuestion(
  candidates: readonly QuestionCandidate[],
  context: QuestionSelectionContext,
): QuestionSelectionResult {
  if (candidates.length === 0) {
    throw new Error('At least one question candidate is required');
  }

  const targetDifficulty = getTargetDifficulty(
    context.round,
    context.question,
    context.totalRounds,
    context.questionsPerRound,
  );

  const cutoffMs =
    context.nowMs -
    (context.antiRepeatWindowDays ?? DEFAULT_ANTI_REPEAT_WINDOW_DAYS) * DAY_IN_MS;
  const excludedIds = new Set(context.excludedQuestionIds ?? []);

  const preferredDifficulties = [targetDifficulty, ...DIFFICULTY_FALLBACKS[targetDifficulty]];

  for (const respectAntiRepeat of [true, false] as const) {
    for (const difficulty of preferredDifficulties) {
      const pool = candidates
        .filter((candidate) => candidate.difficulty === difficulty)
        .filter((candidate) => !excludedIds.has(candidate.id))
        .filter((candidate) =>
          respectAntiRepeat ? isOutsideAntiRepeatWindow(candidate.lastUsedAtMs, cutoffMs) : true,
        )
        .sort(compareQuestionCandidates);

      if (pool.length > 0) {
        return {
          question: pool[0],
          targetDifficulty,
          antiRepeatRespected: respectAntiRepeat,
        };
      }
    }
  }

  throw new Error('No selectable question remained after applying filters');
}

function difficultyFromProgress(progress: number): QuestionDifficulty {
  if (progress < 0.34) {
    return QUESTION_DIFFICULTIES[0];
  }

  if (progress < 0.74) {
    return QUESTION_DIFFICULTIES[1];
  }

  return QUESTION_DIFFICULTIES[2];
}

function isOutsideAntiRepeatWindow(
  lastUsedAtMs: number | null | undefined,
  cutoffMs: number,
): boolean {
  return lastUsedAtMs == null || lastUsedAtMs <= cutoffMs;
}

function compareQuestionCandidates(left: QuestionCandidate, right: QuestionCandidate): number {
  return (
    normalizeLastUsedAt(left.lastUsedAtMs) - normalizeLastUsedAt(right.lastUsedAtMs) ||
    (left.timesUsed ?? 0) - (right.timesUsed ?? 0) ||
    left.id.localeCompare(right.id)
  );
}

function normalizeLastUsedAt(lastUsedAtMs: number | null | undefined): number {
  return lastUsedAtMs ?? Number.NEGATIVE_INFINITY;
}
