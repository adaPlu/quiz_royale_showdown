import { create } from "zustand";

import type { PlayerSummary } from "@/types/game";
import type { ServerEvent } from "@/lib/contracts";

type QuestionState = {
  roundId: string;
  questionId: string;
  prompt: string;
  answers: string[];
  timeLimitMs: number;
  startedAt: string;
} | null;

type ResultState = {
  correctAnswerIndex: number;
  rankings: Array<{ playerId: string; scoreDelta: number; totalScore: number }>;
} | null;

type GameStore = {
  roomId: string | null;
  code: string | null;
  phase: string;
  players: PlayerSummary[];
  question: QuestionState;
  result: ResultState;
  winnerId: string | null;
  applyServerEvent: (event: ServerEvent) => void;
};

export const useGameStore = create<GameStore>((set) => ({
  roomId: null,
  code: null,
  phase: "WAITING",
  players: [],
  question: null,
  result: null,
  winnerId: null,
  applyServerEvent: (event) => {
    switch (event.type) {
      case "room:state_sync":
        set({
          roomId: event.payload.room.roomId,
          code: event.payload.room.code,
          phase: event.payload.room.phase,
          players: event.payload.room.players
        });
        break;
      case "room:player_joined":
        set((state) => ({ players: [...state.players, event.payload.player] }));
        break;
      case "room:player_left":
        set((state) => ({
          players: state.players.filter((player) => player.id !== event.payload.playerId)
        }));
        break;
      case "round:countdown_started":
        set({ phase: "COUNTDOWN", result: null });
        break;
      case "round:question_started":
        set({
          phase: "QUESTION_ACTIVE",
          question: {
            roundId: event.payload.roundId,
            questionId: event.payload.questionId,
            prompt: event.payload.prompt,
            answers: event.payload.answers,
            timeLimitMs: event.payload.timeLimitMs,
            startedAt: event.payload.startedAt
          }
        });
        break;
      case "round:answer_locked":
        set({ phase: "ANSWER_LOCKED" });
        break;
      case "round:result":
        set({
          phase: "ROUND_RESULT",
          result: {
            correctAnswerIndex: event.payload.correctAnswerIndex,
            rankings: event.payload.rankings
          },
          players: event.payload.rankings.map((ranking) => ({
            id: ranking.playerId,
            displayName: ranking.playerId,
            score: ranking.totalScore,
            streak: 0,
            isEliminated: false
          }))
        });
        break;
      case "round:elimination":
        set({
          phase: "ELIMINATION",
          players: event.payload.survivors
        });
        break;
      case "round:finale_started":
        set({ phase: "FINALE" });
        break;
      case "game:over":
        set({ phase: "GAME_OVER", winnerId: event.payload.winnerId });
        break;
    }
  }
}));
