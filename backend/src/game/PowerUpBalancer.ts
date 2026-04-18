import { scoreAnswer } from './ScoringEngine';

export interface SimulatedPlayerProfile {
  id: string;
  baseCorrectRate: number;
  baseAnswerTimeMs: number;
  answerTimeVarianceMs?: number;
}

export interface PowerUpDefinition {
  id: string;
  accuracyDelta?: number;
  answerTimeDeltaMs?: number;
  scoreMultiplier?: number;
  maxUsesPerMatch?: number;
}

export interface BalanceSweepConfig {
  seed: number;
  matches: number;
  questionsPerMatch: number;
  timeLimitMs: number;
  targetPlayerId: string;
  players: readonly SimulatedPlayerProfile[];
  powerUps: readonly PowerUpDefinition[];
}

export interface BalanceSweepSummary {
  id: string;
  averageScore: number;
  averageCorrectRate: number;
  winRate: number;
  scoreDeltaVsBaseline: number;
  winRateDeltaVsBaseline: number;
}

export interface BalanceSweepResult {
  seed: number;
  baseline: BalanceSweepSummary;
  powerUps: BalanceSweepSummary[];
}

export function runPowerUpBalanceSweep(
  config: BalanceSweepConfig,
): BalanceSweepResult {
  if (config.matches <= 0 || config.questionsPerMatch <= 0 || config.timeLimitMs <= 0) {
    throw new Error('matches, questionsPerMatch, and timeLimitMs must be positive');
  }

  const baselineMetrics = simulateScenario(config, null);
  const baseline = toSummary('baseline', baselineMetrics, baselineMetrics);

  const powerUps = config.powerUps.map((powerUp) =>
    toSummary(powerUp.id, simulateScenario(config, powerUp), baselineMetrics),
  );

  return {
    seed: config.seed,
    baseline,
    powerUps,
  };
}

interface ScenarioMetrics {
  totalScore: number;
  totalCorrectAnswers: number;
  totalQuestions: number;
  wins: number;
  matches: number;
}

function simulateScenario(
  config: BalanceSweepConfig,
  powerUp: PowerUpDefinition | null,
): ScenarioMetrics {
  if (!config.players.some((player) => player.id === config.targetPlayerId)) {
    throw new Error(`Missing target player: ${config.targetPlayerId}`);
  }

  let totalScore = 0;
  let totalCorrectAnswers = 0;
  let wins = 0;

  for (let matchIndex = 0; matchIndex < config.matches; matchIndex += 1) {
    const rng = createRng(hashScenarioSeed(config.seed, powerUp?.id ?? 'baseline', matchIndex));
    const streaks = new Map(config.players.map((player) => [player.id, 0]));
    const scores = new Map(config.players.map((player) => [player.id, 0]));

    for (let questionIndex = 0; questionIndex < config.questionsPerMatch; questionIndex += 1) {
      for (const player of config.players) {
        const appliedPowerUp =
          player.id === config.targetPlayerId &&
          powerUp != null &&
          questionIndex < (powerUp.maxUsesPerMatch ?? config.questionsPerMatch)
            ? powerUp
            : null;

        const correctRate = clamp(
          player.baseCorrectRate + (appliedPowerUp?.accuracyDelta ?? 0),
          0,
          0.99,
        );
        const varianceMs = player.answerTimeVarianceMs ?? 200;
        const answerTimeMs = clamp(
          Math.round(
            player.baseAnswerTimeMs +
              (rng() - 0.5) * 2 * varianceMs +
              (appliedPowerUp?.answerTimeDeltaMs ?? 0),
          ),
          0,
          config.timeLimitMs,
        );
        const isCorrect = rng() < correctRate;
        const currentStreak = streaks.get(player.id) ?? 0;
        const scored = scoreAnswer({
          isCorrect,
          answerTimeMs,
          timeLimitMs: config.timeLimitMs,
          currentStreak,
        });
        const powerAdjustedScore = Math.round(
          scored.awardedScore * (appliedPowerUp?.scoreMultiplier ?? 1),
        );

        streaks.set(player.id, scored.nextStreak);
        scores.set(player.id, (scores.get(player.id) ?? 0) + powerAdjustedScore);

        if (player.id === config.targetPlayerId) {
          totalScore += powerAdjustedScore;
          if (isCorrect) {
            totalCorrectAnswers += 1;
          }
        }
      }
    }

    const highestScore = Math.max(...scores.values());
    const winners = [...scores.entries()].filter(([, score]) => score === highestScore);

    if (winners.some(([playerId]) => playerId === config.targetPlayerId)) {
      wins += 1 / winners.length;
    }
  }

  return {
    totalScore,
    totalCorrectAnswers,
    totalQuestions: config.matches * config.questionsPerMatch,
    wins,
    matches: config.matches,
  };
}

function toSummary(
  id: string,
  metrics: ScenarioMetrics,
  baselineMetrics: ScenarioMetrics,
): BalanceSweepSummary {
  const averageScore = metrics.totalScore / metrics.matches;
  const averageCorrectRate = metrics.totalCorrectAnswers / metrics.totalQuestions;
  const winRate = metrics.wins / metrics.matches;
  const baselineAverageScore = baselineMetrics.totalScore / baselineMetrics.matches;
  const baselineWinRate = baselineMetrics.wins / baselineMetrics.matches;

  return {
    id,
    averageScore,
    averageCorrectRate,
    winRate,
    scoreDeltaVsBaseline: averageScore - baselineAverageScore,
    winRateDeltaVsBaseline: winRate - baselineWinRate,
  };
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function hashScenarioSeed(seed: number, scenarioId: string, matchIndex: number): number {
  let hash = (seed ^ matchIndex) >>> 0;

  for (let index = 0; index < scenarioId.length; index += 1) {
    hash = ((hash << 5) - hash + scenarioId.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
