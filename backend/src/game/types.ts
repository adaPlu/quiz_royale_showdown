export const GAME_PHASES = [
  'WAITING',
  'COUNTDOWN',
  'QUESTION_ACTIVE',
  'ANSWER_LOCKED',
  'ROUND_RESULT',
  'ELIMINATION',
  'FINALE',
  'GAME_OVER',
] as const;

export type GamePhase = (typeof GAME_PHASES)[number];

export const QUESTION_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

export type QuestionDifficulty = (typeof QUESTION_DIFFICULTIES)[number];

export interface QuestionCandidate {
  id: string;
  difficulty: QuestionDifficulty;
  lastUsedAtMs?: number | null;
  timesUsed?: number;
  tags?: readonly string[];
}

export interface PlayerStanding {
  playerId: string;
  roundScore: number;
  totalScore?: number;
  answerTimeMs?: number | null;
}
