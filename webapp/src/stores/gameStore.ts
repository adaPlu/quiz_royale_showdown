import { create } from "zustand";

import type { PlayerSummary, ServerEvent } from "@/lib/contracts";
import type { RoomPhase } from "@/types/game";

type QuestionState = {
  roundId: string;
  questionId: string;
  prompt: string;
  answers: string[];
  timeLimitMs: number;
  startedAt: string;
  submittedAnswerIndex: number | null;
} | null;

type ResultState = {
  roundId: string;
  correctAnswerIndex: number;
  rankings: Array<{ playerId: string; scoreDelta: number; totalScore: number }>;
} | null;

type FinalStanding = {
  playerId: string;
  rank: number;
  score: number;
  xpAwarded: number;
  displayName: string;
};

type GameStore = {
  roomId: string | null;
  code: string | null;
  phase: RoomPhase;
  roundNumber: number;
  totalRounds: number;
  joinStatus: "idle" | "joining" | "joined" | "error";
  joinError: string | null;
  countdown: { startsAt: string; seconds: number } | null;
  players: PlayerSummary[];
  question: QuestionState;
  result: ResultState;
  finalStandings: FinalStanding[] | null;
  winnerId: string | null;
  requestJoin: (roomCode: string) => void;
  failJoin: (message: string) => void;
  clearRoom: () => void;
  markAnswerSubmitted: (answerIndex: number) => void;
  applyServerEvent: (event: ServerEvent) => void;
};

const mergePlayers = (players: PlayerSummary[]): PlayerSummary[] => {
  const byId = new Map<string, PlayerSummary>();
  players.forEach((player) => {
    byId.set(player.id, player);
  });
  return Array.from(byId.values()).sort((left, right) => right.score - left.score);
};

export const useGameStore = create<GameStore>((set) => ({
  roomId: null,
  code: null,
  phase: "IDLE",
  roundNumber: 0,
  totalRounds: 0,
  joinStatus: "idle",
  joinError: null,
  countdown: null,
  players: [],
  question: null,
  result: null,
  finalStandings: null,
  winnerId: null,
  requestJoin: (roomCode) =>
    set({
      code: roomCode.trim().toUpperCase(),
      joinStatus: "joining",
      joinError: null
    }),
  failJoin: (message) =>
    set({
      joinStatus: "error",
      joinError: message
    }),
  clearRoom: () =>
    set({
      roomId: null,
      code: null,
      phase: "IDLE",
      roundNumber: 0,
      totalRounds: 0,
      joinStatus: "idle",
      joinError: null,
      countdown: null,
      players: [],
      question: null,
      result: null,
      finalStandings: null,
      winnerId: null
    }),
  markAnswerSubmitted: (answerIndex) =>
    set((state) => ({
      question: state.question
        ? {
            ...state.question,
            submittedAnswerIndex: answerIndex
          }
        : null
    })),
  applyServerEvent: (event) => {
    switch (event.type) {
      case "room:state_sync":
        set((state) => ({
          roomId: event.payload.room.roomId,
          code: event.payload.room.code,
          phase: event.payload.room.phase,
          roundNumber: event.payload.room.roundNumber,
          totalRounds: event.payload.room.totalRounds,
          joinStatus: "joined",
          joinError: null,
          countdown: event.payload.room.phase === "COUNTDOWN" ? state.countdown : null,
          players: mergePlayers(event.payload.room.players),
          question:
            event.payload.room.phase === "QUESTION_ACTIVE" || event.payload.room.phase === "ANSWER_LOCKED"
              ? state.question
              : null,
          result: event.payload.room.phase === "ROUND_RESULT" ? state.result : null,
          finalStandings: event.payload.room.phase === "GAME_OVER" ? state.finalStandings : null,
          winnerId: event.payload.room.phase === "GAME_OVER" ? state.winnerId : null
        }));
        break;
      case "room:player_joined":
        set((state) => ({
          players: mergePlayers([...state.players, event.payload.player])
        }));
        break;
      case "room:player_left":
        set((state) => ({
          players: state.players.filter((player) => player.id !== event.payload.playerId)
        }));
        break;
      case "round:countdown_started":
        set({
          phase: "COUNTDOWN",
          countdown: {
            startsAt: event.payload.startsAt,
            seconds: event.payload.seconds
          },
          question: null,
          result: null,
          finalStandings: null,
          winnerId: null
        });
        break;
      case "round:question_started":
        set({
          phase: "QUESTION_ACTIVE",
          countdown: null,
          question: {
            roundId: event.payload.roundId,
            questionId: event.payload.questionId,
            prompt: event.payload.prompt,
            answers: event.payload.answers,
            timeLimitMs: event.payload.timeLimitMs,
            startedAt: event.payload.startedAt,
            submittedAnswerIndex: null
          },
          result: null
        });
        break;
      case "round:answer_locked":
        set({ phase: "ANSWER_LOCKED" });
        break;
      case "round:result":
        set((state) => ({
          phase: "ROUND_RESULT",
          result: {
            roundId: event.payload.roundId,
            correctAnswerIndex: event.payload.correctAnswerIndex,
            rankings: event.payload.rankings
          },
          players: mergePlayers(
            event.payload.rankings.map((ranking) => {
              const existingPlayer = state.players.find((player) => player.id === ranking.playerId);
              return {
                id: ranking.playerId,
                displayName: existingPlayer?.displayName ?? ranking.playerId,
                avatarUrl: existingPlayer?.avatarUrl,
                score: ranking.totalScore,
                streak: existingPlayer?.streak ?? 0,
                isEliminated: existingPlayer?.isEliminated ?? false
              };
            })
          )
        }));
        break;
      case "round:elimination":
        set({
          phase: "ELIMINATION",
          players: mergePlayers(event.payload.survivors)
        });
        break;
      case "round:finale_started":
        set({ phase: "FINALE" });
        break;
      case "game:over":
        set((state) => ({
          phase: "GAME_OVER",
          winnerId: event.payload.winnerId,
          finalStandings: event.payload.finalStandings
            .slice()
            .sort((left, right) => left.rank - right.rank)
            .map((standing) => ({
              ...standing,
              displayName:
                state.players.find((player) => player.id === standing.playerId)?.displayName ??
                standing.playerId
            }))
        }));
        break;
    }
  }
}));
