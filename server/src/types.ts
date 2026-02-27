export type Mode = "QUICK" | "TOURNAMENT";

export type PowerUp = "FIFTY_FIFTY" | "TIME_BOOST" | "SHIELD" | "REVEAL_HINT" | "SKIP";

export type ClientEvent =
  | { type: "JOIN_MATCH"; payload: { mode: Mode; clientVersion: string } }
  | { type: "SUBMIT_ANSWER"; payload: { matchId: string; round: number; choiceId: string; clientTimeMs: number } }
  | { type: "USE_POWERUP"; payload: { matchId: string; round: number; powerup: PowerUp; targetPlayerId?: string | null } }
  | { type: "PING"; payload: { t: number } };

export type ServerEvent =
  | { type: "MATCH_FOUND"; payload: { matchId: string; startAtMs: number; players: number } }
  | { type: "LOBBY_UPDATE"; payload: { playersInQueue: number } }
  | {
      type: "ROUND_START";
      payload: {
        matchId: string;
        round: number;
        endsAtMs: number;
        question: { id: string; text: string; choices: { id: string; text: string }[] };
      };
    }
  | {
      type: "ROUND_RESULT";
      payload: {
        matchId: string;
        round: number;
        correctChoiceId: string;
        you: { alive: boolean; shieldConsumed?: boolean };
        playersAlive: number;
      };
    }
  | { type: "MATCH_END"; payload: { matchId: string; finalRank: number; rewards: { xp: number; coins: number } } }
  | { type: "PONG"; payload: { t: number; serverTimeMs: number } }
  | { type: "ERROR"; payload: { code: string; message: string } };
