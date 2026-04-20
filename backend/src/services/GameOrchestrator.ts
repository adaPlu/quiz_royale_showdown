import { Difficulty, type QuestionBank } from "@prisma/client";
import type { Server } from "socket.io";

import { eliminateBottomN } from "../game/EliminationEngine";
import { powerUpBalancer } from "../game/PowerUpBalancer";
import {
  createInitialGameState,
  transitionGameState,
  type GameStateSnapshot,
} from "../game/GameStateMachine";
import { selectQuestion } from "../game/QuestionSelector";
import type { PlayerStanding, QuestionDifficulty } from "../game/types";
import { prisma } from "../models/prismaClient";
import type { PlayerSummary, ServerEvents } from "../types/contracts";
import { generateId } from "../utils/ulid";
import { logger } from "../utils/logger";
import { powerUpService } from "./PowerUpService";
import { redisService } from "./RedisService";

const DEFAULT_COUNTDOWN_MS = 5_000;
const DEFAULT_QUESTION_TIME_LIMIT_MS = 20_000;
const DEFAULT_TIMER_GRACE_MS = 500;
const DEFAULT_ROUND_RESULT_MS = 4_000;
const DEFAULT_ELIMINATION_MS = 3_000;
const GAME_STATE_TTL_SECONDS = 2 * 60 * 60;
const HEARTBEAT_TTL_SECONDS = 60;

interface CurrentQuestionContext {
  roundId: string;
  roundNumber: number;
  questionId: string;
  prompt: string;
  answers: string[];
  correctAnswerIndex: number;
  startedAtMs: number;
  timeLimitMs: number;
}

interface StoredAnswer {
  scoreDelta: number;
  answerTimeMs: number;
  isCorrect: boolean;
}

export interface GameOrchestratorOptions {
  countdownMs?: number;
  questionTimeLimitMs?: number;
  timerGraceMs?: number;
  roundResultMs?: number;
  eliminationMs?: number;
  now?: () => number;
  delay?: (durationMs: number) => Promise<void>;
}

export function computeEliminationCount(playersRemaining: number): number {
  if (playersRemaining <= 2) {
    return 0;
  }
  return Math.min(playersRemaining - 2, Math.max(1, Math.floor(playersRemaining * 0.2)));
}

export class GameOrchestrator {
  private readonly usedQuestionIdsByRoom = new Map<string, Set<string>>();
  private readonly options: Required<GameOrchestratorOptions>;

  constructor(options: GameOrchestratorOptions = {}) {
    this.options = {
      countdownMs: options.countdownMs ?? DEFAULT_COUNTDOWN_MS,
      questionTimeLimitMs: options.questionTimeLimitMs ?? DEFAULT_QUESTION_TIME_LIMIT_MS,
      timerGraceMs: options.timerGraceMs ?? DEFAULT_TIMER_GRACE_MS,
      roundResultMs: options.roundResultMs ?? DEFAULT_ROUND_RESULT_MS,
      eliminationMs: options.eliminationMs ?? DEFAULT_ELIMINATION_MS,
      now: options.now ?? Date.now,
      delay: options.delay ?? ((durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs))),
    };
  }

  async startGame(roomId: string, playerIds: string[], io: Server): Promise<void> {
    const uniquePlayerIds = [...new Set(playerIds)];
    if (uniquePlayerIds.length < 2) {
      throw new Error("At least 2 players are required to start a game");
    }

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      select: { totalRounds: true },
    });
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    logger.info("Game loop starting", { roomId, playerCount: uniquePlayerIds.length });

    let activePlayerIds = uniquePlayerIds;
    let state = transitionGameState(
      { ...createInitialGameState(), playerCount: activePlayerIds.length },
      { type: "READY_FOR_COUNTDOWN", playerCount: activePlayerIds.length },
    );
    state = { ...state, round: 1 };
    await this.seedGameState(roomId, activePlayerIds, state);

    let finaleStarted = false;

    for (let roundNumber = 1; roundNumber <= room.totalRounds && activePlayerIds.length > 1; roundNumber += 1) {
      if (state.phase === "ROUND_RESULT" || state.phase === "ELIMINATION") {
        state = transitionGameState(state, { type: "START_NEXT_ROUND" });
        state = { ...state, round: roundNumber, playerCount: activePlayerIds.length };
        await this.persistState(roomId, state);
      }

      if (state.phase === "COUNTDOWN") {
        await this.runCountdown(roomId, io);
      }

      state = transitionGameState(state, { type: "BEGIN_QUESTION", question: roundNumber });
      state = { ...state, round: roundNumber, playerCount: activePlayerIds.length };
      await this.persistState(roomId, state);

      const questionContext = await this.runQuestion(roomId, roundNumber, io);
      await this.delayWithHeartbeat(roomId, "question", questionContext.timeLimitMs + this.options.timerGraceMs);

      state = transitionGameState(state, { type: "LOCK_ANSWERS" });
      await this.persistState(roomId, state);
      await this.lockRound(roomId, questionContext.roundId, io);

      state = transitionGameState(state, { type: "SHOW_ROUND_RESULT" });
      await this.persistState(roomId, state);
      await this.runRoundResult(roomId, questionContext, activePlayerIds, io);

      const eliminationCount = roundNumber % 2 === 0 ? computeEliminationCount(activePlayerIds.length) : 0;
      if (!finaleStarted && eliminationCount > 0 && roundNumber < room.totalRounds) {
        const eliminatedPlayerIds = await this.applyElimination(
          roomId,
          questionContext.roundId,
          activePlayerIds,
          eliminationCount,
          io,
        );

        if (eliminatedPlayerIds.length > 0) {
          activePlayerIds = activePlayerIds.filter((playerId) => !eliminatedPlayerIds.includes(playerId));
          state = transitionGameState(state, { type: "APPLY_ELIMINATION", eliminatedPlayerIds });
          state = { ...state, playerCount: activePlayerIds.length };
          await this.persistState(roomId, state);
        }
      }

      if (!finaleStarted && activePlayerIds.length <= 2 && activePlayerIds.length > 1 && roundNumber < room.totalRounds) {
        state = transitionGameState(state, { type: "START_FINALE", finalistIds: activePlayerIds });
        await this.persistState(roomId, state);
        finaleStarted = true;
        emitToRoom(io, roomId, {
          type: "round:finale_started",
          version: "v1",
          payload: { roomId, finalistIds: activePlayerIds },
        });
      }
    }

    const winnerId = await this.computeWinner(roomId, activePlayerIds);
    state = transitionGameState(state, { type: "COMPLETE_GAME", winnerIds: winnerId ? [winnerId] : [] });
    await this.persistState(roomId, state);
    await this.completeGame(roomId, winnerId, io);
    this.usedQuestionIdsByRoom.delete(roomId);
  }

  private async runCountdown(roomId: string, io: Server): Promise<void> {
    const startsAt = new Date(this.options.now() + this.options.countdownMs).toISOString();
    await prisma.room.update({ where: { id: roomId }, data: { status: "COUNTDOWN" } });

    emitToRoom(io, roomId, {
      type: "round:countdown_started",
      version: "v1",
      payload: {
        roomId,
        startsAt,
        seconds: Math.ceil(this.options.countdownMs / 1000),
      },
    });

    await this.delayWithHeartbeat(roomId, "countdown", this.options.countdownMs);
  }

  private async runQuestion(roomId: string, roundNumber: number, io: Server): Promise<CurrentQuestionContext> {
    const question = await this.selectQuestion(roomId, roundNumber);
    const roundId = generateId();
    const startedAtMs = this.options.now();
    const answers = [question.optionA, question.optionB, question.optionC, question.optionD];

    await prisma.$transaction([
      prisma.room.update({
        where: { id: roomId },
        data: { status: "QUESTION_ACTIVE", currentRound: roundNumber },
      }),
      prisma.round.create({
        data: {
          id: roundId,
          roomId,
          roundNumber,
          questionId: question.id,
          difficulty: question.difficulty,
          startedAt: new Date(startedAtMs),
        },
      }),
    ]);

    const context: CurrentQuestionContext = {
      roundId,
      roundNumber,
      questionId: question.id,
      prompt: question.prompt,
      answers,
      correctAnswerIndex: question.correctIndex,
      startedAtMs,
      timeLimitMs: this.options.questionTimeLimitMs,
    };

    if (redisService) {
      await redisService.setJson(`game:${roomId}:current_question`, context, GAME_STATE_TTL_SECONDS);
    }

    emitToRoom(io, roomId, {
      type: "round:question_started",
      version: "v1",
      payload: {
        roomId,
        roundId,
        questionId: question.id,
        prompt: question.prompt,
        answers,
        timeLimitMs: context.timeLimitMs,
        startedAt: new Date(startedAtMs).toISOString(),
      },
    });

    logger.info("Question started", { roomId, roundId, roundNumber, questionId: question.id });

    return context;
  }

  private async lockRound(roomId: string, roundId: string, io: Server): Promise<void> {
    const lockedAt = new Date();
    await prisma.$transaction([
      prisma.room.update({ where: { id: roomId }, data: { status: "ANSWER_LOCKED" } }),
      prisma.round.update({ where: { id: roundId }, data: { lockedAt } }),
    ]);

    emitToRoom(io, roomId, {
      type: "round:answer_locked",
      version: "v1",
      payload: { roomId, roundId, lockedAt: lockedAt.toISOString() },
    });
  }

  private async runRoundResult(
    roomId: string,
    questionContext: CurrentQuestionContext,
    activePlayerIds: string[],
    io: Server,
  ): Promise<void> {
    await prisma.$transaction([
      prisma.room.update({ where: { id: roomId }, data: { status: "ROUND_RESULT" } }),
      prisma.round.update({ where: { id: questionContext.roundId }, data: { resolvedAt: new Date() } }),
    ]);

    const answers = await this.loadStoredAnswers(roomId, questionContext.roundId);
    const totals = await this.loadTotalScores(roomId, activePlayerIds);
    const rankings = activePlayerIds
      .map((playerId) => ({
        playerId,
        scoreDelta: answers.get(playerId)?.scoreDelta ?? 0,
        totalScore: totals.get(playerId) ?? 0,
      }))
      .sort((left, right) => right.totalScore - left.totalScore || left.playerId.localeCompare(right.playerId));

    emitToRoom(io, roomId, {
      type: "round:result",
      version: "v1",
      payload: {
        roomId,
        roundId: questionContext.roundId,
        correctAnswerIndex: questionContext.correctAnswerIndex,
        rankings,
      },
    });

    // Loot drops — grant power-ups to bottom 40% of players to keep games competitive
    const avgScore = rankings.reduce((s, r) => s + r.totalScore, 0) / Math.max(1, rankings.length);
    const roundNumber = questionContext.roundNumber ?? 0;
    await Promise.allSettled(
      rankings.map(async ({ playerId, totalScore }) => {
        if (!powerUpBalancer.shouldGrantLootAfterRound(roundNumber, totalScore, avgScore)) return;
        const code = powerUpBalancer.rollLoot(rankings.length);
        if (!code) return;
        const powerUp = await prisma.powerUp.findFirst({ where: { code, isActive: true } });
        if (!powerUp) return;
        await prisma.playerPowerUp.upsert({
          where: { userId_powerUpId: { userId: playerId, powerUpId: powerUp.id } },
          update: { quantity: { increment: 1 } },
          create: { id: generateId(), userId: playerId, powerUpId: powerUp.id, quantity: 1 },
        });
        io.to(playerId).emit("v1:powerup:loot_drop", { roomId, powerupCode: code, ts: Date.now() });
      })
    );

    await this.delayWithHeartbeat(roomId, "round_result", this.options.roundResultMs);
  }

  private async applyElimination(
    roomId: string,
    roundId: string,
    activePlayerIds: string[],
    eliminateCount: number,
    io: Server,
  ): Promise<string[]> {
    const shieldedPlayerIds = await powerUpService.getShieldedPlayers(roomId);
    const standings = await this.loadStandings(roomId, roundId, activePlayerIds);
    const result = eliminateBottomN(standings, {
      eliminateCount,
      minimumSurvivors: 2,
      protectedPlayerIds: shieldedPlayerIds,
    });
    const eliminatedPlayerIds = result.eliminated.map((standing) => standing.playerId);

    if (eliminatedPlayerIds.length === 0) {
      return [];
    }

    await prisma.roomPlayer.updateMany({
      where: { roomId, userId: { in: eliminatedPlayerIds } },
      data: { isEliminated: true, eliminatedAt: new Date() },
    });

    if (redisService) {
      await redisService.srem(`room:${roomId}:players`, ...eliminatedPlayerIds);
      await Promise.all(shieldedPlayerIds.map((playerId) => powerUpService.consumeShield(roomId, playerId)));
    }

    await prisma.room.update({ where: { id: roomId }, data: { status: "ELIMINATION" } });
    const survivors = await this.loadSurvivorSummaries(roomId);

    emitToRoom(io, roomId, {
      type: "round:elimination",
      version: "v1",
      payload: {
        roomId,
        eliminatedPlayerIds,
        survivors,
      },
    });

    await this.delayWithHeartbeat(roomId, "elimination", this.options.eliminationMs);

    return eliminatedPlayerIds;
  }

  private async completeGame(roomId: string, winnerId: string | null, io: Server): Promise<void> {
    const allPlayers = await prisma.roomPlayer.findMany({
      where: { roomId },
      select: { userId: true, score: true },
    });
    const scoreMap = await this.loadTotalScores(
      roomId,
      allPlayers.map((player) => player.userId),
    );

    const finalStandings = allPlayers
      .map((player) => ({
        playerId: player.userId,
        score: scoreMap.get(player.userId) ?? player.score,
      }))
      .sort((left, right) => right.score - left.score || left.playerId.localeCompare(right.playerId))
      .map((standing, index) => ({
        ...standing,
        rank: index + 1,
        xpAwarded: Math.max(10, Math.round(standing.score / 10)),
      }));

    await prisma.$transaction([
      prisma.room.update({ where: { id: roomId }, data: { status: "GAME_OVER", finishedAt: new Date() } }),
      ...finalStandings.map((standing) =>
        prisma.xpEvent.create({
          data: {
            id: generateId(),
            userId: standing.playerId,
            reason: "GAME_FINISH",
            amount: standing.xpAwarded,
            metadata: { roomId, rank: standing.rank },
          },
        }),
      ),
    ]);

    emitToRoom(io, roomId, {
      type: "game:over",
      version: "v1",
      payload: {
        roomId,
        winnerId: winnerId ?? "",
        finalStandings,
      },
    });

    if (redisService) {
      await redisService.del(`game:${roomId}:state`, `game:${roomId}:current_question`);
    }
  }

  private async selectQuestion(roomId: string, roundNumber: number): Promise<QuestionBank> {
    const usedQuestionIds = this.usedQuestionIdsByRoom.get(roomId) ?? new Set<string>();
    this.usedQuestionIdsByRoom.set(roomId, usedQuestionIds);

    const questions = await prisma.questionBank.findMany({
      where: {
        isActive: true,
        id: usedQuestionIds.size > 0 ? { notIn: [...usedQuestionIds] } : undefined,
      },
      orderBy: [{ lastUsedAt: "asc" }, { id: "asc" }],
      take: 100,
    });
    const pool = questions.length > 0 ? questions : await prisma.questionBank.findMany({ where: { isActive: true } });

    const byId = new Map(pool.map((question) => [question.id, question]));
    const selected = selectQuestion(
      pool.map((question) => ({
        id: question.id,
        difficulty: toGameDifficulty(question.difficulty),
        lastUsedAtMs: question.lastUsedAt?.getTime() ?? null,
      })),
      {
        round: roundNumber,
        question: 1,
        totalRounds: 10,
        questionsPerRound: 1,
        nowMs: this.options.now(),
      },
    );

    const question = byId.get(selected.question.id);
    if (!question) {
      throw new Error("Selected question was not found in query result");
    }

    usedQuestionIds.add(question.id);
    await prisma.questionBank.update({ where: { id: question.id }, data: { lastUsedAt: new Date() } });

    return question;
  }

  private async loadStoredAnswers(roomId: string, roundId: string): Promise<Map<string, StoredAnswer>> {
    if (!redisService) {
      const answers = await prisma.answer.findMany({ where: { roundId } });
      return new Map(
        answers.map((answer) => [
          answer.userId,
          {
            scoreDelta: answer.isCorrect ? 0 : 0,
            answerTimeMs: answer.answerTimeMs,
            isCorrect: answer.isCorrect,
          },
        ]),
      );
    }

    const raw = await redisService.hgetall(`room:${roomId}:round:${roundId}:answers`);
    return new Map(
      Object.entries(raw).map(([playerId, value]) => [playerId, JSON.parse(value) as StoredAnswer]),
    );
  }

  private async loadStandings(roomId: string, roundId: string, playerIds: string[]): Promise<PlayerStanding[]> {
    const answers = await this.loadStoredAnswers(roomId, roundId);
    const totals = await this.loadTotalScores(roomId, playerIds);

    return playerIds.map((playerId) => ({
      playerId,
      roundScore: answers.get(playerId)?.scoreDelta ?? 0,
      totalScore: totals.get(playerId) ?? 0,
      answerTimeMs: answers.get(playerId)?.answerTimeMs ?? null,
    }));
  }

  private async loadTotalScores(roomId: string, playerIds: string[]): Promise<Map<string, number>> {
    if (!redisService) {
      const players = await prisma.roomPlayer.findMany({
        where: { roomId, userId: { in: playerIds } },
        select: { userId: true, score: true },
      });
      return new Map(players.map((player) => [player.userId, player.score]));
    }

    const entries = await redisService.zrevrangeWithScores(`room:${roomId}:scores`, 0, -1);
    const scores = new Map(entries.map((entry) => [entry.member, entry.score]));
    for (const playerId of playerIds) {
      if (!scores.has(playerId)) {
        scores.set(playerId, 0);
      }
    }
    return scores;
  }

  private async loadSurvivorSummaries(roomId: string): Promise<PlayerSummary[]> {
    const players = await prisma.roomPlayer.findMany({
      where: { roomId, isEliminated: false },
      include: { user: { select: { displayName: true, avatarUrl: true } } },
      orderBy: [{ score: "desc" }, { seatIndex: "asc" }],
    });

    return players.map((player) => ({
      id: player.userId,
      displayName: player.user.displayName,
      avatarUrl: player.user.avatarUrl ?? undefined,
      score: player.score,
      streak: player.streak,
      isEliminated: player.isEliminated,
    }));
  }

  private async computeWinner(roomId: string, activePlayerIds: string[]): Promise<string | null> {
    if (activePlayerIds.length === 0) {
      return null;
    }

    const scores = await this.loadTotalScores(roomId, activePlayerIds);
    return activePlayerIds
      .slice()
      .sort((left, right) => (scores.get(right) ?? 0) - (scores.get(left) ?? 0) || left.localeCompare(right))[0];
  }

  private async seedGameState(roomId: string, playerIds: string[], state: GameStateSnapshot): Promise<void> {
    const redis = redisService;
    if (redis) {
      await Promise.all([
        redis.sadd(`room:${roomId}:players`, ...playerIds),
        ...playerIds.map((playerId) => redis.zadd(`room:${roomId}:scores`, 0, playerId)),
      ]);
    }
    await this.persistState(roomId, state);
  }

  private async persistState(roomId: string, state: GameStateSnapshot): Promise<void> {
    if (redisService) {
      await redisService.setJson(`game:${roomId}:state`, state, GAME_STATE_TTL_SECONDS);
    }
  }

  private async delayWithHeartbeat(roomId: string, label: string, durationMs: number): Promise<void> {
    if (redisService) {
      await redisService.set(`game:${roomId}:heartbeat:${label}`, "1", HEARTBEAT_TTL_SECONDS);
    }
    await this.options.delay(durationMs);
    if (redisService) {
      await redisService.set(`game:${roomId}:heartbeat:${label}`, "1", HEARTBEAT_TTL_SECONDS);
    }
  }
}

function emitToRoom(io: Server, roomId: string, event: ServerEvents): void {
  io.to(roomId).emit("message", event);
}

function toGameDifficulty(difficulty: Difficulty): QuestionDifficulty {
  return difficulty.toLowerCase() as QuestionDifficulty;
}

export const gameOrchestrator = new GameOrchestrator();
