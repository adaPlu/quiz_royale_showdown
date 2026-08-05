import { randomInt } from "node:crypto";

import { Difficulty } from "@prisma/client";

import { redisService } from "./RedisService";

export const GAME_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type GameDifficulty = (typeof GAME_DIFFICULTIES)[number];

export const DEFAULT_GAME_DIFFICULTY: GameDifficulty = "medium";

const ROOM_DIFFICULTY_TTL_SECONDS = 60 * 60 * 2;
const difficultyKey = (roomId: string) => `room:${roomId}:difficulty`;
const secureRandomIndex = (maxExclusive: number) => randomInt(maxExclusive);

const DIFFICULTY_POOLS: Readonly<Record<GameDifficulty, readonly Difficulty[]>> = {
  easy: [Difficulty.EASY],
  medium: [Difficulty.EASY, Difficulty.MEDIUM],
  hard: [Difficulty.MEDIUM, Difficulty.HARD],
};

export function getAllowedQuestionDifficulties(
  gameDifficulty: GameDifficulty,
): readonly Difficulty[] {
  return DIFFICULTY_POOLS[gameDifficulty];
}

export function buildQuestionDifficultyPlan(
  gameDifficulty: GameDifficulty,
  questionCount: number,
  chooseIndex: (maxExclusive: number) => number = secureRandomIndex,
): Difficulty[] {
  if (!Number.isInteger(questionCount) || questionCount <= 0) {
    throw new Error("questionCount must be a positive integer");
  }

  const allowed = [...getAllowedQuestionDifficulties(gameDifficulty)];
  const plan = Array.from(
    { length: questionCount },
    (_, index) => allowed[index % allowed.length],
  );

  for (let index = plan.length - 1; index > 0; index -= 1) {
    const swapIndex = chooseIndex(index + 1);
    [plan[index], plan[swapIndex]] = [plan[swapIndex], plan[index]];
  }

  return plan;
}

export async function getRoomGameDifficulty(roomId: string): Promise<GameDifficulty> {
  if (!redisService) {
    return DEFAULT_GAME_DIFFICULTY;
  }

  const stored = await redisService.get(difficultyKey(roomId));
  return GAME_DIFFICULTIES.includes(stored as GameDifficulty)
    ? (stored as GameDifficulty)
    : DEFAULT_GAME_DIFFICULTY;
}

export async function setRoomGameDifficulty(
  roomId: string,
  gameDifficulty: GameDifficulty,
): Promise<void> {
  if (!redisService) {
    return;
  }

  await redisService.set(
    difficultyKey(roomId),
    gameDifficulty,
    ROOM_DIFFICULTY_TTL_SECONDS,
  );
}
