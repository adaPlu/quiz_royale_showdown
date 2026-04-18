/**
 * GameOrchestrator — drives the GameStateMachine through the game loop.
 *
 * All timers write a Redis heartbeat key so crash-recovery agents can detect stale games.
 */

import type { Server } from "socket.io";
import { prisma } from "../models/prismaClient";
import { redisService } from "./RedisService";
import {
  transitionGameState,
  createInitialGameState,
  type GameStateSnapshot,
} from "../game/GameStateMachine";
import { eliminateBottomN } from "../game/EliminationEngine";
import type { PlayerStanding } from "../game/types";
import type { QuestionBank, Difficulty } from "@prisma/client";
import { generateId } from "../utils/ulid";
import { logger } from "../utils/logger";

const COUNTDOWN_MS = 5_000;
const ROUND_RESULT_DISPLAY_MS = 4_000;
const ELIMINATION_DISPLAY_MS = 3_000;
const DEFAULT_TIME_LIMIT_MS = 20_000;
const HEARTBEAT_TTL_SECONDS = 60;
const GAME_STATE_TTL_SECONDS = 7200;

// ─── Helper: timed delay with Redis heartbeat ─────────────────────────────────

function timedDelay(
  roomId: string,
  label: string,
  durationMs: number
): Promise<void> {
  return new Promise<void>((resolve) => {
    const heartbeatKey = `game:${roomId}:heartbeat:${label}`;
    const resolveWithHeartbeat = async () => {
      if (redisService) {
        await redisService.set(heartbeatKey, "1", HEARTBEAT_TTL_SECONDS).catch(() => undefined);
      }
      resolve();
    };
    setTimeout(() => void resolveWithHeartbeat(), durationMs);
  });
}

// ─── GameOrchestrator ─────────────────────────────────────────────────────────

export class GameOrchestrator {
  private usedQuestionIds: string[] = [];

  async startGame(roomId: string, playerIds: string[], io: Server): Promise<void> {
    logger.info("GameOrchestrator starting", { roomId, playerCount: playerIds.length });

    // Bootstrap state
    let state = transitionGameState(
      { ...createInitialGameState(), playerCount: playerIds.length },
      { type: "READY_FOR_COUNTDOWN", playerCount: playerIds.length }
    );

    await this.persistState(roomId, state);

    // Seed Redis scores and player set
    if (redisService) {
      await Promise.all(
        playerIds.map((pid) => redisService!.zadd(`room:${roomId}:scores`, 0, pid))
      );
      await Promise.all(playerIds.map((pid) => redisService!.sadd(`room:${roomId}:players`, pid)));
    }

    await this.runCountdown(roomId, io, state);

    // Game loop — up to totalRounds rounds, then finale
    const totalRounds = 10;
    let round = 0;

    while (round < totalRounds && state.playerCount > 1) {
      round++;

      state = transitionGameState(state, { type: "BEGIN_QUESTION" });
      await this.persistState(roomId, state);
      await this.runQuestion(roomId, io, state);

      state = transitionGameState(state, { type: "LOCK_ANSWERS" });
      await this.persistState(roomId, state);

      state = transitionGameState(state, { type: "SHOW_ROUND_RESULT" });
      await this.persistState(roomId, state);
      await this.runRoundEnd(roomId, io, state, playerIds);

      // Eliminate after every 2 rounds, keeping at least 2 players
      if (round % 2 === 0 && state.playerCount > 2) {
        const scores = await this.loadScores(roomId, playerIds);
        const eliminateCount = this.computeEliminationCount(state.playerCount);
        const { eliminated, survivors } = eliminateBottomN(scores, {
          eliminateCount,
          minimumSurvivors: 2,
        });
        const eliminatedIds = eliminated.map((e) => e.playerId);

        state = transitionGameState(state, {
          type: "APPLY_ELIMINATION",
          eliminatedPlayerIds: eliminatedIds,
        });
        await this.persistState(roomId, state);

        await this.runElimination(roomId, io, eliminatedIds, survivors);

        state = transitionGameState(state, { type: "START_NEXT_ROUND" });
        await this.persistState(roomId, state);
        await this.runCountdown(roomId, io, state);
      }
    }

    // Finale round
    const finalistIds = playerIds.filter(
      (pid) => !state.eliminatedPlayerIds.includes(pid)
    );

    if (finalistIds.length > 0) {
      state = transitionGameState(state, {
        type: "START_FINALE",
        finalistIds,
      });
      await this.persistState(roomId, state);
      await this.runFinale(roomId, io, state);
    }

    // Game over
    const winnerIds = await this.computeWinners(roomId, finalistIds);
    state = transitionGameState(state, { type: "COMPLETE_GAME", winnerIds });
    await this.persistState(roomId, state);
    await this.runGameOver(roomId, io, winnerIds);
  }

  // ─── Phase runners ───────────────────────────────────────────────────────

  private async runCountdown(
    roomId: string,
    io: Server,
    _state: GameStateSnapshot
  ): Promise<void> {
    logger.info("Countdown started", { roomId });
    io.to(roomId).emit("v1:countdown_start", {
      roomId,
      startsInMs: COUNTDOWN_MS,
      startedAt: new Date().toISOString(),
    });
    await timedDelay(roomId, "countdown", COUNTDOWN_MS);
  }

  private async runQuestion(
    roomId: string,
    io: Server,
    _state: GameStateSnapshot
  ): Promise<void> {
    let question: QuestionBank;
    try {
      question = await this.selectQuestion(this.usedQuestionIds);
    } catch (err) {
      logger.error("No questions available", { roomId, err });
      return;
    }

    this.usedQuestionIds.push(question.id);

    const options = [question.optionA, question.optionB, question.optionC, question.optionD];
    const startTs = Date.now();

    // Persist question context for reconnects
    if (redisService) {
      await redisService.setJson(
        `game:${roomId}:current_question`,
        {
          questionId: question.id,
          prompt: question.prompt,
          options,
          correctIndex: question.correctIndex,
          startTs,
          timeLimitMs: DEFAULT_TIME_LIMIT_MS,
        },
        GAME_STATE_TTL_SECONDS
      );
    }

    // Create round record in Prisma
    const round = await prisma.round.findFirst({
      where: { roomId },
      orderBy: { roundNumber: "desc" },
    });
    const roundNumber = (round?.roundNumber ?? 0) + 1;
    const roundId = generateId();

    await prisma.round.create({
      data: {
        id: roundId,
        roomId,
        roundNumber,
        questionId: question.id,
        difficulty: question.difficulty,
        startedAt: new Date(startTs),
      },
    });

    logger.info("Question started", { roomId, questionId: question.id, roundId });

    // Emit question WITHOUT correctIndex
    io.to(roomId).emit("v1:question", {
      roomId,
      roundId,
      questionId: question.id,
      prompt: question.prompt,
      options,
      timeLimitMs: DEFAULT_TIME_LIMIT_MS,
      startTs,
    });

    // Wait for time limit + grace
    await timedDelay(roomId, "question", DEFAULT_TIME_LIMIT_MS + 500);

    // Lock answers in Prisma
    await prisma.round.update({
      where: { id: roundId },
      data: { lockedAt: new Date() },
    });
  }

  private async runRoundEnd(
    roomId: string,
    io: Server,
    _state: GameStateSnapshot,
    _playerIds: string[]
  ): Promise<void> {
    const questionCtx = redisService
      ? await redisService.getJson<{
          questionId: string;
          correctIndex: number;
        }>(`game:${roomId}:current_question`)
      : null;

    const scoreEntries = redisService
      ? await redisService.zrevrangeWithScores(`room:${roomId}:scores`, 0, -1)
      : [];

    const rankings = scoreEntries.map(({ member, score }) => ({
      playerId: member,
      totalScore: score,
    }));

    logger.info("Round ended", { roomId });

    io.to(roomId).emit("v1:round_result", {
      roomId,
      correctIndex: questionCtx?.correctIndex ?? -1,
      rankings,
    });

    await timedDelay(roomId, "round_result", ROUND_RESULT_DISPLAY_MS);
  }

  private async runElimination(
    roomId: string,
    io: Server,
    eliminatedIds: string[],
    survivors: PlayerStanding[]
  ): Promise<void> {
    logger.info("Elimination phase", { roomId, eliminatedIds });

    io.to(roomId).emit("v1:elimination", {
      roomId,
      eliminatedPlayerIds: eliminatedIds,
      survivors: survivors.map((s) => ({
        playerId: s.playerId,
        score: s.totalScore ?? s.roundScore,
      })),
    });

    await timedDelay(roomId, "elimination", ELIMINATION_DISPLAY_MS);
  }

  private async runFinale(
    roomId: string,
    io: Server,
    state: GameStateSnapshot
  ): Promise<void> {
    logger.info("Finale started", { roomId, finalists: state.finalists });

    io.to(roomId).emit("v1:finale_start", {
      roomId,
      finalistIds: state.finalists,
    });

    // Run one final question — no Second Chance in finale
    await this.runQuestion(roomId, io, state);
    await this.runRoundEnd(roomId, io, state, [...state.finalists]);
  }

  private async runGameOver(
    roomId: string,
    io: Server,
    winnerIds: string[]
  ): Promise<void> {
    logger.info("Game over", { roomId, winnerIds });

    // Award XP to all players
    const scoreEntries = redisService
      ? await redisService.zrevrangeWithScores(`room:${roomId}:scores`, 0, -1)
      : [];

    const finalStandings = scoreEntries.map(({ member, score }, index) => ({
      playerId: member,
      rank: index + 1,
      score,
      xpAwarded: Math.max(10, Math.round(score / 10)),
    }));

    // Write XP events
    await Promise.all(
      finalStandings.map(async (s) => {
        await prisma.xpEvent.create({
          data: {
            id: generateId(),
            userId: s.playerId,
            reason: "GAME_FINISH",
            amount: s.xpAwarded,
            metadata: { roomId, rank: s.rank },
          },
        });
      })
    );

    // Update room status in Prisma
    await prisma.room.update({
      where: { id: roomId },
      data: { status: "GAME_OVER", finishedAt: new Date() },
    });

    io.to(roomId).emit("v1:game_over", {
      roomId,
      winnerIds,
      finalStandings,
    });

    // Clean up Redis keys
    if (redisService) {
      await redisService.del(
        `game:${roomId}:state`,
        `game:${roomId}:current_question`,
        `room:${roomId}:players`,
        `room:${roomId}:scores`
      );
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async selectQuestion(usedIds: string[]): Promise<QuestionBank> {
    const question = await prisma.questionBank.findFirst({
      where: {
        isActive: true,
        id: { notIn: usedIds.length > 0 ? usedIds : undefined },
      },
      orderBy: [{ lastUsedAt: "asc" }, { id: "asc" }],
    });

    if (!question) throw new Error("No available questions in the bank");

    // Update lastUsedAt
    await prisma.questionBank.update({
      where: { id: question.id },
      data: { lastUsedAt: new Date() },
    });

    return question;
  }

  private async loadScores(roomId: string, playerIds: string[]): Promise<PlayerStanding[]> {
    if (!redisService) {
      return playerIds.map((pid) => ({ playerId: pid, roundScore: 0, totalScore: 0 }));
    }

    const entries = await redisService.zrevrangeWithScores(`room:${roomId}:scores`, 0, -1);
    const scoreMap = Object.fromEntries(entries.map(({ member, score }) => [member, score]));

    return playerIds.map((pid) => ({
      playerId: pid,
      roundScore: scoreMap[pid] ?? 0,
      totalScore: scoreMap[pid] ?? 0,
    }));
  }

  private computeEliminationCount(playersRemaining: number): number {
    // Eliminate bottom 20% or at least 1, but keep minimum 2
    return Math.max(1, Math.floor(playersRemaining * 0.2));
  }

  private async computeWinners(roomId: string, finalistIds: string[]): Promise<string[]> {
    if (!redisService || finalistIds.length === 0) return finalistIds.slice(0, 1);

    const entries = await redisService.zrevrangeWithScores(`room:${roomId}:scores`, 0, 0);
    return entries.map((e) => e.member);
  }

  private async persistState(roomId: string, state: GameStateSnapshot): Promise<void> {
    if (!redisService) return;
    await redisService.setJson(`game:${roomId}:state`, state, GAME_STATE_TTL_SECONDS);
  }
}

export const gameOrchestrator = new GameOrchestrator();
