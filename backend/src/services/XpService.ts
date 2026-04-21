import { prisma } from "../models/prismaClient";
import { generateId } from "../utils/ulid";

export interface XpAwardInput {
  playerId: string;
  rank: number;
  totalPlayers: number;
  score: number;
}

export interface LevelUpResult {
  playerId: string;
  xpAwarded: number;
  totalXp: number;
  newLevel: number;
  prevLevel: number;
  didLevelUp: boolean;
  xpToNextLevel: number;
}

// Level N unlocks at N² × 150 cumulative XP. Level 1 is free (0 XP needed).
export function levelFromTotalXp(totalXp: number): number {
  if (totalXp <= 0) return 1;
  // Solve N² × 150 ≤ totalXp: N = floor(sqrt(totalXp / 150))
  const level = Math.floor(Math.sqrt(totalXp / 150));
  return Math.max(1, level);
}

export function xpToNextLevel(currentLevel: number): number {
  const nextLevelThreshold = (currentLevel + 1) * (currentLevel + 1) * 150;
  return nextLevelThreshold;
}

function computeXpAward(rank: number, totalPlayers: number, score: number): number {
  const placementRatio = totalPlayers <= 1 ? 1 : (totalPlayers - rank + 1) / totalPlayers;
  const placementXp = Math.round(placementRatio * 200);
  const winBonus = rank === 1 ? 500 : 0;
  const scoreXp = Math.max(0, Math.round(score / 10));
  return 100 + placementXp + winBonus + scoreXp;
}

export async function awardMatchXp(
  roomId: string,
  players: XpAwardInput[],
): Promise<LevelUpResult[]> {
  const results: LevelUpResult[] = [];

  // Fetch current total XP for all players in a single query
  const xpSums = await prisma.xpEvent.groupBy({
    by: ["userId"],
    where: { userId: { in: players.map((p) => p.playerId) } },
    _sum: { amount: true },
  });
  const currentXpMap = new Map(xpSums.map((row) => [row.userId, row._sum.amount ?? 0]));

  for (const player of players) {
    const xpAwarded = computeXpAward(player.rank, player.totalPlayers, player.score);
    const prevTotalXp = currentXpMap.get(player.playerId) ?? 0;
    const newTotalXp = prevTotalXp + xpAwarded;
    const prevLevel = levelFromTotalXp(prevTotalXp);
    const newLevel = levelFromTotalXp(newTotalXp);
    const nextThreshold = xpToNextLevel(newLevel);

    await prisma.xpEvent.create({
      data: {
        id: generateId(),
        userId: player.playerId,
        reason: "GAME_FINISH",
        amount: xpAwarded,
        metadata: { roomId, rank: player.rank },
      },
    });

    results.push({
      playerId: player.playerId,
      xpAwarded,
      totalXp: newTotalXp,
      newLevel,
      prevLevel,
      didLevelUp: newLevel > prevLevel,
      xpToNextLevel: nextThreshold,
    });
  }

  return results;
}

export const xpService = { awardMatchXp, levelFromTotalXp, xpToNextLevel };
