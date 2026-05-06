/**
 * GameOrchestrator drives the GameStateMachine through the game loop and emits
 * contract-aligned socket envelopes on the `message` event.
 */

import type { QuestionBank } from "@prisma/client";
import type { Server } from "socket.io";
import { prisma } from "../models/prismaClient";
import {
  createInitialGameState,
  transitionGameState,
  type GameStateSnapshot
} from "../game/GameStateMachine";
import { eliminateBottomN } from "../game/EliminationEngine";
import type { PlayerStanding } from "../game/types";
import { redisService } from "./RedisService";
import { powerUpService } from "./PowerUpService";
import { roomService } from "./RoomService";
import { generateId } from "../utils/ulid";
import { BadRequestError } from "../utils/errors";
import { logger } from "../utils/logger";
import type { PlayerSummary, ServerEvents } from "../types/contracts";
import { awardMatchXp, levelFromTotalXp, xpToNextLevel } from "./XpService";

const COUNTDOWN_MS = 5_000;
const ROUND_RESULT_DISPLAY_MS = 4_000;
const ELIMINATION_DISPLAY_MS = 3_000;
const DEFAULT_TIME_LIMIT_MS = 20_000;
const HEARTBEAT_TTL_SECONDS = 60;
const GAME_STATE_TTL_SECONDS = 7200;

type CurrentQuestionContext = {
  roundId: string;
  questionId: string;
  prompt: string;
  answers: string[];
  correctAnswerIndex: number;
  startTs: number;
  startedAt: string;
  timeLimitMs: number;
};

type StoredAnswerRecord = {
  answerIndex: number;
  clientSentAt: string;
  isCorrect: boolean;
  scoreDelta: number;
  submittedAt: string;
};

function emitRoomEnvelope(io: Server, roomId: string, envelope: ServerEvents): void {
  io.to(roomId).emit("message", envelope);
}

function timedDelay(roomId: string, label: string, durationMs: number): Promise<void> {
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

export class GameOrchestrator {
  private readonly activeRooms = new Set<string>();
  private readonly botIds = new Map<string, string[]>();

  hasActiveGame(roomId: string): boolean {
    return this.activeRooms.has(roomId);
  }

  async assertQuestionBankReady(): Promise<void> {
    const activeQuestionCount = await prisma.questionBank.count({
      where: { isActive: true }
    });

    if (activeQuestionCount === 0) {
      throw new BadRequestError("No active questions are available. Add questions before starting a game.");
    }
  }

  async startGame(roomId: string, playerIds: string[], io: Server): Promise<void> {
    if (redisService) {
      const acquired = await redisService.setnx(`game:${roomId}:lock`, '1', 30);
      if (!acquired) {
        logger.warn("GameOrchestrator.startGame: lock already held, skipping duplicate start", { roomId });
        return;
      }
    }
    logger.info("GameOrchestrator starting", { roomId, playerCount: playerIds.length });
    this.activeRooms.add(roomId);

    try {
      await this.assertQuestionBankReady();

      let state = transitionGameState(
        { ...createInitialGameState(), playerCount: playerIds.length },
        { type: "READY_FOR_COUNTDOWN", playerCount: playerIds.length }
      );

      await this.persistState(roomId, state);

      if (redisService) {
        const redis = redisService;
        await Promise.all(playerIds.map((playerId) => redis.zadd(`room:${roomId}:scores`, 0, playerId)));
        await Promise.all(playerIds.map((playerId) => redis.sadd(`room:${roomId}:players`, playerId)));
      }

      await this.runCountdown(roomId, io);

      const totalRounds = 10;
      const usedQuestionIds: string[] = [];
      const activePlayerIds = new Set(playerIds);
      this.botIds.set(roomId, playerIds.filter((id) => id.startsWith('bot:')));
      let round = 0;

      while (round < totalRounds && state.playerCount > 1) {
        round++;

        state = transitionGameState(state, { type: "BEGIN_QUESTION" });
        await this.persistState(roomId, state);
        await this.runQuestion(roomId, io, usedQuestionIds);

        state = transitionGameState(state, { type: "LOCK_ANSWERS" });
        await this.persistState(roomId, state);

        state = transitionGameState(state, { type: "SHOW_ROUND_RESULT" });
        await this.persistState(roomId, state);
        await this.runRoundEnd(roomId, io);

        if (round % 2 === 0 && state.playerCount > 2) {
          const scores = await this.loadScores(roomId, [...activePlayerIds]);
          const eliminateCount = this.computeEliminationCount(state.playerCount);
          const { eliminated, survivors } = eliminateBottomN(scores, {
            eliminateCount,
            minimumSurvivors: 2
          });

          // SHIELD: remove any shielded players from this elimination wave
          const shieldedPlayers = await powerUpService.getShieldedPlayers(roomId);
          const shieldedSet = new Set(shieldedPlayers);
          const unshieldedEliminated = eliminated.filter((e) => !shieldedSet.has(e.playerId));
          for (const playerId of shieldedPlayers) {
            if (eliminated.some((e) => e.playerId === playerId)) {
              await powerUpService.consumeShield(roomId, playerId);
              logger.info("Shield blocked elimination", { roomId, playerId });
            }
          }

          const eliminatedIds = unshieldedEliminated.map((entry) => entry.playerId);
          eliminatedIds.forEach((playerId) => activePlayerIds.delete(playerId));

          state = transitionGameState(state, {
            type: "APPLY_ELIMINATION",
            eliminatedPlayerIds: eliminatedIds
          });
          await this.persistState(roomId, state);

          await this.runElimination(roomId, io, eliminatedIds, survivors);

          state = transitionGameState(state, { type: "START_NEXT_ROUND" });
          await this.persistState(roomId, state);
          await this.runCountdown(roomId, io);
        }
      }

      const finalistIds = [...activePlayerIds];

      if (finalistIds.length > 0) {
        state = transitionGameState(state, {
          type: "START_FINALE",
          finalistIds
        });
        await this.persistState(roomId, state);
        await this.runFinale(roomId, io, state, usedQuestionIds);
      }

      const winnerIds = await this.computeWinners(roomId, finalistIds);
      state = transitionGameState(state, { type: "COMPLETE_GAME", winnerIds });
      await this.persistState(roomId, state);
      await this.runGameOver(roomId, io, winnerIds, finalistIds);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await roomService.resetStartFailure(roomId, message);

      if (redisService) {
        await redisService.del(
          `game:${roomId}:state`,
          `game:${roomId}:current_question`,
          `room:${roomId}:players`,
          `room:${roomId}:scores`
        ).catch(() => undefined);
      }

      emitRoomEnvelope(io, roomId, {
        type: "error",
        version: "v1",
        payload: {
          code: "GAME_START_FAILED",
          message
        }
      });

      throw error;
    } finally {
      this.activeRooms.delete(roomId);
      this.botIds.delete(roomId);
      if (redisService) {
        await redisService.del(`game:${roomId}:lock`).catch(() => undefined);
      }
    }
  }

  private async runCountdown(roomId: string, io: Server): Promise<void> {
    const startsAt = new Date(Date.now() + COUNTDOWN_MS).toISOString();

    logger.info("Countdown started", { roomId, startsAt });

    emitRoomEnvelope(io, roomId, {
      type: "round:countdown_started",
      version: "v1",
      payload: {
        roomId,
        startsAt,
        seconds: COUNTDOWN_MS / 1000
      }
    });

    await timedDelay(roomId, "countdown", COUNTDOWN_MS);
  }

  private async runQuestion(roomId: string, io: Server, usedQuestionIds: string[]): Promise<void> {
    const latestRound = await prisma.round.findFirst({
      where: { roomId },
      orderBy: { roundNumber: "desc" },
      select: { roundNumber: true }
    });
    const roundNumber = (latestRound?.roundNumber ?? 0) + 1;

    let question: QuestionBank;

    try {
      question = await this.selectQuestion(usedQuestionIds, roundNumber);
    } catch (error) {
      logger.error("No questions available", {
        roomId,
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }

    usedQuestionIds.push(question.id);

    const answers = [question.optionA, question.optionB, question.optionC, question.optionD];
    const startTs = Date.now();
    const startedAt = new Date(startTs).toISOString();

    const roundId = generateId();

    await prisma.round.create({
      data: {
        id: roundId,
        roomId,
        roundNumber,
        questionId: question.id,
        difficulty: question.difficulty,
        startedAt: new Date(startTs)
      }
    });

    if (redisService) {
      await redisService.setJson<CurrentQuestionContext>(
        `game:${roomId}:current_question`,
        {
          roundId,
          questionId: question.id,
          prompt: question.prompt,
          answers,
          correctAnswerIndex: question.correctIndex,
          startTs,
          startedAt,
          timeLimitMs: DEFAULT_TIME_LIMIT_MS
        },
        GAME_STATE_TTL_SECONDS
      );
    }

    logger.info("Question started", { roomId, roundId, questionId: question.id });

    emitRoomEnvelope(io, roomId, {
      type: "round:question_started",
      version: "v1",
      payload: {
        roomId,
        roundId,
        questionId: question.id,
        prompt: question.prompt,
        answers,
        timeLimitMs: DEFAULT_TIME_LIMIT_MS,
        startedAt
      }
    });

    const botPlayerIds = this.botIds.get(roomId) ?? [];
    const botTimers: NodeJS.Timeout[] = [];
    for (const botId of botPlayerIds) {
      const minDelay = 2000;
      const maxDelay = DEFAULT_TIME_LIMIT_MS - 1000;
      const delay = minDelay + Math.floor(Math.random() * (maxDelay - minDelay));
      const timer = setTimeout(() => {
        void this.submitBotAnswer(roomId, roundId, botId, question.correctIndex, startTs, DEFAULT_TIME_LIMIT_MS);
      }, delay);
      botTimers.push(timer);
    }
    try {
      await timedDelay(roomId, "question", DEFAULT_TIME_LIMIT_MS + 500);
    } finally {
      botTimers.forEach((t) => clearTimeout(t));
    }

    const lockedAt = new Date().toISOString();

    await prisma.round.update({
      where: { id: roundId },
      data: { lockedAt: new Date(lockedAt) }
    });

    emitRoomEnvelope(io, roomId, {
      type: "round:answer_locked",
      version: "v1",
      payload: {
        roomId,
        roundId,
        lockedAt
      }
    });
  }

  private async runRoundEnd(roomId: string, io: Server): Promise<void> {
    const questionContext = redisService
      ? await redisService.getJson<CurrentQuestionContext>(`game:${roomId}:current_question`)
      : null;

    if (!questionContext) {
      logger.warn("Skipping round result emit without current question context", { roomId });
      return;
    }

    const answers = redisService
      ? await redisService.hgetall(`room:${roomId}:round:${questionContext.roundId}:answers`)
      : {};
    const answerRecords = Object.fromEntries(
      Object.entries(answers).map(([playerId, raw]) => [playerId, JSON.parse(raw) as StoredAnswerRecord])
    );

    const scoreEntries = redisService
      ? await redisService.zrevrangeWithScores(`room:${roomId}:scores`, 0, -1)
      : [];

    const rankings = scoreEntries.map(({ member, score }) => ({
      playerId: member,
      scoreDelta: answerRecords[member]?.scoreDelta ?? 0,
      totalScore: score
    }));

    logger.info("Round ended", { roomId, roundId: questionContext.roundId });

    emitRoomEnvelope(io, roomId, {
      type: "round:result",
      version: "v1",
      payload: {
        roomId,
        roundId: questionContext.roundId,
        correctAnswerIndex: questionContext.correctAnswerIndex,
        rankings
      }
    });

    await prisma.round.updateMany({
      where: { id: questionContext.roundId, resolvedAt: null },
      data: { resolvedAt: new Date() }
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

    const survivorIds = survivors.map((survivor) => survivor.playerId);
    const survivorRows = survivorIds.length
      ? await prisma.roomPlayer.findMany({
          where: {
            roomId,
            userId: { in: survivorIds }
          },
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true
              }
            }
          }
        })
      : [];

    const survivorScoreMap = new Map(
      survivors.map((survivor) => [survivor.playerId, survivor.totalScore ?? survivor.roundScore])
    );
    const survivorById = new Map(survivorRows.map((row) => [row.userId, row]));

    const survivorSummaries = survivorIds.reduce<PlayerSummary[]>((result, playerId) => {
      const row = survivorById.get(playerId);

      if (!row) {
        return result;
      }

      result.push({
        id: row.userId,
        displayName: row.user.displayName,
        avatarUrl: row.user.avatarUrl ?? undefined,
        score: survivorScoreMap.get(playerId) ?? row.score,
        streak: row.streak,
        isEliminated: false
      });

      return result;
    }, []);

    emitRoomEnvelope(io, roomId, {
      type: "round:elimination",
      version: "v1",
      payload: {
        roomId,
        eliminatedPlayerIds: eliminatedIds,
        survivors: survivorSummaries
      }
    });

    await timedDelay(roomId, "elimination", ELIMINATION_DISPLAY_MS);
  }

  private async runFinale(
    roomId: string,
    io: Server,
    state: GameStateSnapshot,
    usedQuestionIds: string[]
  ): Promise<void> {
    logger.info("Finale started", { roomId, finalists: state.finalists });

    emitRoomEnvelope(io, roomId, {
      type: "round:finale_started",
      version: "v1",
      payload: {
        roomId,
        finalistIds: [...state.finalists]
      }
    });

    await this.runQuestion(roomId, io, usedQuestionIds);
    await this.runRoundEnd(roomId, io);
  }

  private async runGameOver(
    roomId: string,
    io: Server,
    winnerIds: string[],
    finalistIds: string[]
  ): Promise<void> {
    logger.info("Game over", { roomId, winnerIds });

    const finalScores = await this.loadScores(roomId, finalistIds);
    const sortedStandings = finalScores
      .sort((left, right) =>
        (right.totalScore ?? right.roundScore) - (left.totalScore ?? left.roundScore) ||
        left.playerId.localeCompare(right.playerId)
      )
      .map((standing, index) => {
        const score = standing.totalScore ?? standing.roundScore;
        return { playerId: standing.playerId, rank: index + 1, score };
      });

    const xpResults = await awardMatchXp(
      roomId,
      sortedStandings.map((s) => ({
        playerId: s.playerId,
        rank: s.rank,
        totalPlayers: sortedStandings.length,
        score: s.score,
      }))
    );
    const xpByPlayer = new Map(xpResults.map((r) => [r.playerId, r]));

    const finalStandings = sortedStandings.map((s) => ({
      ...s,
      xpAwarded: xpByPlayer.get(s.playerId)?.xpAwarded ?? 0,
    }));

    // Emit game:level_up for any player who leveled up
    for (const result of xpResults) {
      if (result.didLevelUp) {
        io.to(result.playerId).emit("message", {
          type: "game:level_up",
          version: "v1",
          payload: {
            userId: result.playerId,
            newLevel: result.newLevel,
            xpAwarded: result.xpAwarded,
            xpToNextLevel: result.xpToNextLevel,
          }
        });
        logger.info("Level up emitted", { roomId, userId: result.playerId, prevLevel: result.prevLevel, newLevel: result.newLevel });
      }
    }

    // Upsert SeasonScore for each finalist if an active season exists
    const season = await prisma.season.findFirst({
      where: { startsAt: { lte: new Date() }, endsAt: { gte: new Date() } },
      orderBy: { startsAt: "desc" },
    });

    if (season) {
      const winnerSet = new Set(winnerIds);
      await Promise.all(
        finalStandings.map(async (standing) => {
          const isWinner = winnerSet.has(standing.playerId);
          await prisma.seasonScore.upsert({
            where: { seasonId_userId: { seasonId: season.id, userId: standing.playerId } },
            create: {
              id: generateId(),
              seasonId: season.id,
              userId: standing.playerId,
              mmr: Math.max(0, 1000 + (isWinner ? 25 : -10)),
              wins: isWinner ? 1 : 0,
              gamesPlayed: 1,
            },
            update: {
              mmr: isWinner ? { increment: 25 } : undefined,
              wins: isWinner ? { increment: 1 } : undefined,
              gamesPlayed: { increment: 1 },
            },
          });
          if (!isWinner) {
            await prisma.$executeRaw`
              UPDATE "SeasonScore" SET mmr = GREATEST(mmr - 10, 0)
              WHERE "userId" = ${standing.playerId} AND "seasonId" = ${season.id}
            `;
          }
        })
      );
      logger.info("SeasonScore upserted", { roomId, seasonId: season.id, count: finalStandings.length });
    } else {
      logger.info("No active season found, skipping SeasonScore upsert", { roomId });
    }

    // Track challenge progress for human players only (skip bot: prefix)
    const today = new Date().toISOString().slice(0, 10);
    const winnerSet = new Set(winnerIds);
    await Promise.allSettled(
      finalStandings
        .filter((s) => !s.playerId.startsWith('bot:'))
        .flatMap((s) => [
          winnerSet.has(s.playerId)
            ? this.trackChallengeProgress(s.playerId, 'win_a_game', 1, 1, today)
            : Promise.resolve(),
          s.rank <= 3
            ? this.trackChallengeProgress(s.playerId, 'top_3', 1, 1, today)
            : Promise.resolve(),
          this.trackChallengeProgress(s.playerId, 'play_3_games', 3, 1, today),
        ])
    );

    await prisma.room.update({
      where: { id: roomId },
      data: { status: "GAME_OVER", finishedAt: new Date() }
    });

    // Persist final scores to RoomPlayer before emitting to clients
    try {
      await Promise.all(
        finalStandings.map((standing) =>
          prisma.roomPlayer.updateMany({
            where: { roomId, userId: standing.playerId },
            data: { score: standing.score },
          })
        )
      );
    } catch (err) {
      logger.error("Failed to persist final scores", { roomId, error: err instanceof Error ? err.message : String(err) });
    }

    emitRoomEnvelope(io, roomId, {
      type: "game:over",
      version: "v1",
      payload: {
        roomId,
        winnerId: winnerIds[0] ?? finalStandings[0]?.playerId ?? "",
        finalStandings
      }
    });

    const POWERUP_CODES = ["DOUBLE_DOWN", "FIFTY_FIFTY", "TIME_FREEZE", "SHIELD", "SABOTAGE"] as const;

    for (const playerId of finalistIds) {
      if (playerId.startsWith('bot:')) continue;
      const randomPowerup = POWERUP_CODES[Math.floor(Math.random() * POWERUP_CODES.length)];
      io.to(playerId).emit("message", {
        type: "powerup:loot_drop",
        version: "v1",
        payload: { powerupType: randomPowerup, quantity: 1 }
      });

      // Persist loot drop to PlayerPowerUp inventory
      try {
        const powerUpRecord = await prisma.powerUp.findUnique({ where: { code: randomPowerup } });
        if (powerUpRecord) {
          await prisma.playerPowerUp.upsert({
            where: { userId_powerUpId: { userId: playerId, powerUpId: powerUpRecord.id } },
            update: { quantity: { increment: 1 } },
            create: {
              id: generateId(),
              userId: playerId,
              powerUpId: powerUpRecord.id,
              quantity: 1,
            },
          });
        }
      } catch (err) {
        logger.error("Failed to persist loot drop", { roomId, userId: playerId, error: err instanceof Error ? err.message : String(err) });
      }
    }

    if (redisService) {
      await redisService.del(
        `game:${roomId}:state`,
        `game:${roomId}:current_question`,
        `room:${roomId}:players`,
        `room:${roomId}:scores`
      );
    }
  }

  private async submitBotAnswer(
    roomId: string,
    roundId: string,
    botId: string,
    correctAnswerIndex: number,
    startTs: number,
    timeLimitMs: number
  ): Promise<void> {
    if (!redisService) return;

    const lockKey = `answer_lock:${roomId}:${roundId}:${botId}`;
    const locked = await redisService.setnx(lockKey, '1', 3600);
    if (!locked) return;

    const receivedAtMs = Date.now();
    const answerIndex = Math.floor(Math.random() * 4);
    const isCorrect = answerIndex === correctAnswerIndex;
    const scoreDelta = isCorrect
      ? Math.max(0, 1000 - Math.floor(((receivedAtMs - startTs) / timeLimitMs) * 400))
      : 0;

    await redisService.zincrby(`room:${roomId}:scores`, scoreDelta, botId);
    await redisService.hset(
      `room:${roomId}:round:${roundId}:answers`,
      botId,
      JSON.stringify({
        answerIndex,
        clientSentAt: new Date(receivedAtMs).toISOString(),
        isCorrect,
        scoreDelta,
        submittedAt: new Date(receivedAtMs).toISOString()
      })
    );

    logger.info("Bot answer submitted", { roomId, roundId, botId, isCorrect, scoreDelta });
  }

  private async selectQuestion(usedIds: string[], roundNumber = 1): Promise<QuestionBank> {
    const targetDifficulty = roundNumber <= 3 ? 'EASY' : roundNumber <= 7 ? 'MEDIUM' : 'HARD';
    const baseWhere = {
      isActive: true,
      id: { notIn: usedIds.length > 0 ? usedIds : undefined }
    };

    let question = await prisma.questionBank.findFirst({
      where: { ...baseWhere, difficulty: targetDifficulty },
      orderBy: [{ lastUsedAt: "asc" }, { id: "asc" }]
    });

    if (!question) {
      question = await prisma.questionBank.findFirst({
        where: baseWhere,
        orderBy: [{ lastUsedAt: "asc" }, { id: "asc" }]
      });
    }

    if (!question) {
      throw new Error("No available questions in the bank");
    }

    await prisma.questionBank.update({
      where: { id: question.id },
      data: { lastUsedAt: new Date() }
    });

    return question;
  }

  private async loadScores(roomId: string, playerIds: string[]): Promise<PlayerStanding[]> {
    if (!redisService) {
      return playerIds.map((playerId) => ({ playerId, roundScore: 0, totalScore: 0 }));
    }

    const entries = await redisService.zrevrangeWithScores(`room:${roomId}:scores`, 0, -1);
    const scoreMap = Object.fromEntries(entries.map(({ member, score }) => [member, score]));

    return playerIds.map((playerId) => ({
      playerId,
      roundScore: scoreMap[playerId] ?? 0,
      totalScore: scoreMap[playerId] ?? 0
    }));
  }

  private computeEliminationCount(playersRemaining: number): number {
    return Math.max(1, Math.floor(playersRemaining * 0.2));
  }

  private async computeWinners(roomId: string, finalistIds: string[]): Promise<string[]> {
    if (finalistIds.length === 0) {
      return finalistIds.slice(0, 1);
    }

    const finalistScores = await this.loadScores(roomId, finalistIds);
    const highestScore = Math.max(
      ...finalistScores.map((standing) => standing.totalScore ?? standing.roundScore)
    );

    return finalistScores
      .filter((standing) => (standing.totalScore ?? standing.roundScore) === highestScore)
      .sort((left, right) => left.playerId.localeCompare(right.playerId))
      .map((standing) => standing.playerId);
  }

  private async trackChallengeProgress(
    playerId: string,
    challengeId: string,
    target: number,
    increment: number,
    today: string
  ): Promise<void> {
    const existing = await prisma.xpEvent.aggregate({
      where: { userId: playerId, reason: { startsWith: `CHALLENGE:${challengeId}:` },
               createdAt: { gte: new Date(`${today}T00:00:00Z`) } },
      _sum: { amount: true },
    });
    const current = existing._sum.amount ?? 0;
    if (current >= target) return; // already completed
    const toAdd = Math.min(increment, target - current);
    await prisma.xpEvent.create({
      data: { id: generateId(), userId: playerId, reason: `CHALLENGE:${challengeId}:${today}`, amount: toAdd,
              metadata: { source: 'game_over' } },
    });
  }

  private async persistState(roomId: string, state: GameStateSnapshot): Promise<void> {
    if (!redisService) {
      return;
    }

    await redisService.setJson(`game:${roomId}:state`, state, GAME_STATE_TTL_SECONDS);
  }
}

export const gameOrchestrator = new GameOrchestrator();
