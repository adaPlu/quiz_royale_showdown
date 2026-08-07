import { randomInt } from "node:crypto";

import { Difficulty } from "@prisma/client";

import { prisma } from "../models/prismaClient";
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

function isGameDifficulty(value: string | null | undefined): value is GameDifficulty {
  return GAME_DIFFICULTIES.includes(value as GameDifficulty);
}

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
  if (redisService) {
    const stored = await redisService.get(difficultyKey(roomId));
    if (isGameDifficulty(stored)) return stored;
  }

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { gameDifficulty: true },
  });
  const difficulty = isGameDifficulty(room?.gameDifficulty)
    ? room.gameDifficulty
    : DEFAULT_GAME_DIFFICULTY;

  if (redisService) {
    await redisService.set(
      difficultyKey(roomId),
      difficulty,
      ROOM_DIFFICULTY_TTL_SECONDS,
    );
  }

  return difficulty;
}

export async function setRoomGameDifficulty(
  roomId: string,
  gameDifficulty: GameDifficulty,
): Promise<void> {
  await prisma.room.update({
    where: { id: roomId },
    data: { gameDifficulty },
  });

  if (redisService) {
    await redisService.set(
      difficultyKey(roomId),
      gameDifficulty,
      ROOM_DIFFICULTY_TTL_SECONDS,
    );
  }
}
