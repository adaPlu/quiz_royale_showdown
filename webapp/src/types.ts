export type GameMode = "QUICK" | "TOURNAMENT" | "PRACTICE";
export type Phase = "LOBBY" | "QUESTION" | "REVEAL" | "FINISHED";

export type AuthUser = {
  kind: "USER";
  userId: string;
  username: string;
  email: string;
  role: string;
  currencyBalances: CurrencyBalances;
  stats: PlayerStats;
  friends: Friend[];
};

export type GuestSession = {
  guestId: string;
  guestSecret?: string;
  displayName: string;
  expiresAt: number;
  stats: PlayerStats;
};

export type PlayerStats = {
  wins: number;
  losses: number;
  matchesPlayed: number;
  totalPoints: number;
  bestScore: number;
  correctAnswers: number;
  powerUpsUsed: number;
  powerUpCharges: number;
};

export type CurrencyBalances = {
  coins: number;
  gems: number;
  seasonalTickets: number;
};

export type Friend = {
  userId: string;
  username: string;
  totalPoints: number;
  wins: number;
  addedAt: number;
  presence: "OFFLINE" | "ONLINE" | "IN_MATCH";
  matchMode: string | null;
};

export type FriendInvite = {
  inviteId: string;
  direction: "incoming" | "outgoing";
  status: string;
  userId: string;
  username: string;
  createdAt: number;
  respondedAt: number | null;
};

export type MatchmakeResponse = {
  roomId: string;
  roomTicket: string;
  mode: GameMode;
  playersWaiting: number;
  lobbyEndsAt: number;
};

export type PublicQuestion = {
  id: string;
  category: string;
  difficulty: string;
  text: string;
  options: string[];
};

export type PublicPlayer = {
  id: string;
  name: string;
  isBot: boolean;
  alive: boolean;
  score: number;
  streak: number;
  lives: number;
  hasAnswered: boolean;
  placement: number | null;
};

export type PublicMatch = {
  matchId: string;
  mode: GameMode;
  phase: Phase;
  roundNumber: number;
  totalRounds: number;
  phaseEndsAt: number;
  question: PublicQuestion | null;
  players: PublicPlayer[];
  winnerId: string | null;
};

export type YouState = {
  playerId: string;
  answerIndex: number | null;
  removedOptions: number[];
  powerUpCharges: number;
};

export type ServerMessage =
  | { type: "STATE"; match: PublicMatch; you: YouState }
  | { type: "ERROR"; code: string; message: string }
  | { type: "PONG"; serverNow: number };

export type LeaderboardEntry = {
  rank: number;
  subjectKind: "USER" | "GUEST";
  subjectId: string;
  displayName: string;
  points: number;
  wins: number;
  isYou: boolean;
};

export type LeaderboardPage = {
  board: string;
  entries: LeaderboardEntry[];
  yourRank: number | null;
  yourPoints: number;
  totalRanked: number;
};

export type Season = {
  seasonId: string;
  name: string;
  startsAt: number;
  endsAt: number;
  rewardTrack: Record<string, unknown>[];
};

export type SeasonProgress = {
  seasonId: string;
  xp: number;
  level: number;
  ticketsEarned: number;
  updatedAt: number;
};

export type StoreItem = {
  itemId: string;
  itemType: string;
  displayName: string;
  description: string;
  currency: keyof CurrencyBalances;
  price: number;
  owned: boolean;
};

export type CosmeticItem = {
  cosmeticId: string;
  cosmeticType: string;
  displayName: string;
  rarity: string;
  payload: Record<string, unknown>;
  owned: boolean;
  equipped: boolean;
};
