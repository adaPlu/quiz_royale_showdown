export type PlayerSummary = {
  id: string;
  displayName: string;
  avatarUrl?: string;
  score: number;
  streak: number;
  isEliminated: boolean;
};
