export interface XpInput {
  placement: number;
  totalPlayers: number;
  streakWins: number;
}

export function calculateMatchXp(input: XpInput): number {
  if (input.totalPlayers <= 0) {
    throw new Error('totalPlayers must be positive');
  }

  if (input.placement <= 0 || input.placement > input.totalPlayers) {
    throw new Error('placement must be within the player count');
  }

  const normalizedPlacement =
    input.totalPlayers === 1
      ? 1
      : (input.totalPlayers - input.placement + 1) / input.totalPlayers;
  const placementXp = Math.round(normalizedPlacement * 200);
  const streakXp = Math.max(0, input.streakWins) * 25;
  const winBonus = input.placement == 1 ? 500 : 0;

  return 100 + placementXp + streakXp + winBonus;
}
