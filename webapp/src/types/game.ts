export type { PlayerSummary, RoomSnapshot } from "../../../backend/src/types/contracts";

export type RoomPhase =
  | "IDLE"
  | "WAITING"
  | "COUNTDOWN"
  | "QUESTION_ACTIVE"
  | "ANSWER_LOCKED"
  | "ROUND_RESULT"
  | "ELIMINATION"
  | "FINALE"
  | "GAME_OVER";
