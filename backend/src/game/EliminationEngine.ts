import type { PlayerStanding } from './types';

export interface EliminationOptions {
  eliminateCount: number;
  minimumSurvivors?: number;
  protectedPlayerIds?: readonly string[];
}

export interface EliminationResult {
  eliminated: PlayerStanding[];
  survivors: PlayerStanding[];
  requestedEliminationCount: number;
  actualEliminationCount: number;
}

export function eliminateBottomN(
  standings: readonly PlayerStanding[],
  options: EliminationOptions,
): EliminationResult {
  if (options.eliminateCount < 0) {
    throw new Error('eliminateCount must be non-negative');
  }

  const protectedIds = new Set(options.protectedPlayerIds ?? []);
  const protectedPlayers: PlayerStanding[] = [];
  const eligiblePlayers: PlayerStanding[] = [];

  for (const standing of standings) {
    if (protectedIds.has(standing.playerId)) {
      protectedPlayers.push({ ...standing });
      continue;
    }

    eligiblePlayers.push({ ...standing });
  }

  const minimumSurvivors = options.minimumSurvivors ?? 1;
  const maxEliminations = Math.max(
    0,
    Math.min(
      options.eliminateCount,
      eligiblePlayers.length,
      standings.length - minimumSurvivors,
    ),
  );

  const ranked = eligiblePlayers.sort(compareForElimination);
  const eliminated = ranked.slice(0, maxEliminations);
  const safe = ranked.slice(maxEliminations).sort(compareForSurvival);
  const survivors = [...protectedPlayers, ...safe].sort(compareForSurvival);

  return {
    eliminated,
    survivors,
    requestedEliminationCount: options.eliminateCount,
    actualEliminationCount: eliminated.length,
  };
}

function compareForElimination(left: PlayerStanding, right: PlayerStanding): number {
  return (
    left.roundScore - right.roundScore ||
    (left.totalScore ?? left.roundScore) - (right.totalScore ?? right.roundScore) ||
    normalizeAnswerTime(right.answerTimeMs) - normalizeAnswerTime(left.answerTimeMs) ||
    left.playerId.localeCompare(right.playerId)
  );
}

function compareForSurvival(left: PlayerStanding, right: PlayerStanding): number {
  return (
    (right.totalScore ?? right.roundScore) - (left.totalScore ?? left.roundScore) ||
    right.roundScore - left.roundScore ||
    normalizeAnswerTime(left.answerTimeMs) - normalizeAnswerTime(right.answerTimeMs) ||
    left.playerId.localeCompare(right.playerId)
  );
}

function normalizeAnswerTime(answerTimeMs: number | null | undefined): number {
  return answerTimeMs ?? Number.POSITIVE_INFINITY;
}
