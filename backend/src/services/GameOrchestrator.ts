/**
 * GameOrchestrator drives the GameStateMachine through the game loop and emits
 * contract-aligned socket envelopes on the `message` event.
 */

import { randomInt } from "node:crypto";

import { Difficulty, type QuestionBank } from "@prisma/client";
import type { Server } from "socket.io";
import { eliminateBottomN } from "../game/EliminationEngine";
import {
  createInitialGameState,
  transitionGameState,
  type GameStateSnapshot
} from "../game/GameStateMachine";
import type { PlayerStanding } from "../game/types";
import { prisma } from "../models/prismaClient";
import type { PlayerSummary, ServerEvents } from "../types/contracts";
import { BadRequestError } from "../utils/errors";
import { logger } from "../utils/logger";
import { resolvePublicDisplayName } from "../utils/publicDisplayName";
import { isGuestEmail } from "../utils/guestUsers";
import { generateId } from "../utils/ulid";
import {
  DEFAULT_GAME_DIFFICULTY,
  buildQuestionDifficultyPlan,
  getAllowedQuestionDifficulties,
  getRoomGameDifficulty,
  type GameDifficulty
} from "./GameDifficultyService";
import { redisService } from "./RedisService";
import { questionGeneratorService } from "./QuestionGeneratorService";
import { roomService } from "./RoomService";

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

type FinalStanding = {
  playerId: string;
  displayName: string;
  rank: number;
  score: number;
  xpAwarded: number;
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

  hasActiveGame(roomId: string): boolean {
    return this.activeRooms.has(roomId);
  }

  async assertQuestionBankReady(
    gameDifficulty: GameDifficulty = DEFAULT_GAME_DIFFICULTY,
    minimumRequired = 10,
  ): Promise<void> {
    const allowedDifficulties = [...getAllowedQuestionDifficulties(gameDifficulty)];
    let activeQuestionCount = await prisma.questionBank.count({
      where: { isActive: true, difficulty: { in: allowedDifficulties } }
    });

    if (activeQuestionCount < minimumRequired) {
      activeQuestionCount = await questionGeneratorService.ensureCapacity(
        allowedDifficulties,
        minimumRequired,
      );
    }

    if (activeQuestionCount < minimumRequired) {
      throw new BadRequestError(
        `At least ${minimumRequired} active ${gameDifficulty} questions are required; ${activeQuestionCount} are available.`
      );
    }
  }

  async startGame(roomId: string, playerIds: string[], io: Server): Promise<void> {
    const gameDifficulty = await getRoomGameDifficulty(roomId);

    logger.info("GameOrchestrator starting", {
      roomId,
      playerCount: playerIds.length,
      gameDifficulty
    });
    this.activeRooms.add(roomId);

    try {
      await this.assertQuestionBankReady(gameDifficulty);

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
      const difficultyPlan = buildQuestionDifficultyPlan(gameDifficulty, totalRounds + 1);
      const usedQuestionIds: string[] = [];
      const activePlayerIds = new Set(playerIds);
      const isSoloGame = playerIds.length === 1;
      let round = 0;
      let questionIndex = 0;

      while (round < totalRounds && (isSoloGame || state.playerCount > 1)) {
        round++;

        state = transitionGameState(state, { type: "BEGIN_QUESTION" });
        await this.persistState(roomId, state);
        await this.runQuestion(
          roomId,
          io,
          usedQuestionIds,
          difficultyPlan[questionIndex++] ?? Difficulty.MEDIUM,
          gameDifficulty
        );

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
          const eliminatedIds = eliminated.map((entry) => entry.playerId);
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

      if (finalistIds.length > 1) {
        state = transitionGameState(state, {
          type: "START_FINALE",
          finalistIds
        });
        await this.persistState(roomId, state);
        await this.runFinale(
          roomId,
          io,
          state,
          usedQuestionIds,
          difficultyPlan[questionIndex] ?? Difficulty.MEDIUM,
          gameDifficulty
        );
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

      const recoveredRoom = await roomService.getRoomById(roomId).catch(() => null);
      if (recoveredRoom) {
        emitRoomEnvelope(io, roomId, {
          type: "room:state_sync",
          version: "v1",
          payload: { room: recoveredRoom.room }
        });
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

  private async runQuestion(
    roomId: string,
    io: Server,
    usedQuestionIds: string[],
    targetDifficulty: Difficulty,
    gameDifficulty: GameDifficulty
  ): Promise<void> {
    let question: QuestionBank;

    try {
      question = await this.selectQuestion(
        usedQuestionIds,
        targetDifficulty,
        gameDifficulty
      );
    } catch (error) {
      logger.error("No questions available", {
        roomId,
        gameDifficulty,
        targetDifficulty,
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }

    usedQuestionIds.push(question.id);

    const answers = [question.optionA, question.optionB, question.optionC, question.optionD];
    const startTs = Date.now();
    const startedAt = new Date(startTs).toISOString();

    const latestRound = await prisma.round.findFirst({
      where: { roomId },
      orderBy: { roundNumber: "desc" },
      select: { roundNumber: true }
    });
    const roundNumber = (latestRound?.roundNumber ?? 0) + 1;
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

    logger.info("Question started", {
      roomId,
      roundId,
      questionId: question.id,
      difficulty: question.difficulty,
      gameDifficulty
    });

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

    await timedDelay(roomId, "question", DEFAULT_TIME_LIMIT_MS + 500);

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
        displayName: resolvePublicDisplayName(row.user.displayName, row.userId),
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
    usedQuestionIds: string[],
    targetDifficulty: Difficulty,
    gameDifficulty: GameDifficulty
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

    await this.runQuestion(
      roomId,
      io,
      usedQuestionIds,
      targetDifficulty,
      gameDifficulty
    );
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
    const userRows = await prisma.user.findMany({
      where: { id: { in: finalScores.map((standing) => standing.playerId) } },
      select: { id: true, email: true, displayName: true }
    });
    const usersById = new Map(userRows.map((user) => [user.id, user]));
    const guestIds = new Set(userRows.filter((user) => isGuestEmail(user.email)).map((user) => user.id));
    const finalStandings = finalScores
      .sort((left, right) =>
        (right.totalScore ?? right.roundScore) - (left.totalScore ?? left.roundScore) ||
        left.playerId.localeCompare(right.playerId)
      )
      .map((standing, index) => {
        const score = standing.totalScore ?? standing.roundScore;
        const user = usersById.get(standing.playerId);
        const isGuest = guestIds.has(standing.playerId);

        return {
          playerId: standing.playerId,
          displayName: resolvePublicDisplayName(user?.displayName, standing.playerId),
          rank: index + 1,
          score,
          xpAwarded: isGuest ? 0 : Math.max(10, Math.round(score / 10))
        };
      });
    const persistentStandings = finalStandings.filter((standing) => !guestIds.has(standing.playerId));

    await this.updateSeasonScores(roomId, persistentStandings, winnerIds);

    await Promise.all(
      persistentStandings.map((standing) =>
        prisma.xpEvent.create({
          data: {
            id: generateId(),
            userId: standing.playerId,
            reason: "GAME_FINISH",
            amount: standing.xpAwarded,
            metadata: { roomId, rank: standing.rank }
          }
        })
      )
    );

    await prisma.room.update({
      where: { id: roomId },
      data: { status: "GAME_OVER", finishedAt: new Date() }
    });

    emitRoomEnvelope(io, roomId, {
      type: "game:over",
      version: "v1",
      payload: {
        roomId,
        winnerId: winnerIds[0] ?? finalStandings[0]?.playerId ?? "",
        finalStandings
      }
    });

    if (redisService) {
      await redisService.del(
        `game:${roomId}:state`,
        `game:${roomId}:current_question`,
        `room:${roomId}:players`,
        `room:${roomId}:scores`
      );
    }
  }

  private async updateSeasonScores(
    roomId: string,
    finalStandings: FinalStanding[],
    winnerIds: string[]
  ): Promise<void> {
    if (finalStandings.length === 0) {
      return;
    }

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      select: { seasonId: true }
    });

    if (!room?.seasonId) {
      return;
    }

    const winnerIdSet = new Set(winnerIds);

    await Promise.all(
      finalStandings.map((standing) => {
        const isWinner = winnerIdSet.has(standing.playerId);
        const mmrDelta = isWinner ? 25 : Math.max(-10, 10 - standing.rank * 5);

        return prisma.seasonScore.upsert({
          where: {
            seasonId_userId: {
              seasonId: room.seasonId as string,
              userId: standing.playerId
            }
          },
          create: {
            id: generateId(),
            seasonId: room.seasonId as string,
            userId: standing.playerId,
            mmr: 1000 + mmrDelta,
            wins: isWinner ? 1 : 0,
            gamesPlayed: 1
          },
          update: {
            mmr: { increment: mmrDelta },
            wins: { increment: isWinner ? 1 : 0 },
            gamesPlayed: { increment: 1 }
          }
        });
      })
    );
  }

  private async selectQuestion(
    usedIds: string[],
    targetDifficulty: Difficulty,
    gameDifficulty: GameDifficulty
  ): Promise<QuestionBank> {
    const allowedDifficulties = [...getAllowedQuestionDifficulties(gameDifficulty)];
    const preferredDifficulties = [
      targetDifficulty,
      ...allowedDifficulties.filter((difficulty) => difficulty !== targetDifficulty)
    ];

    const findCandidate = async (): Promise<QuestionBank | null> => {
      for (const difficulty of preferredDifficulties) {
        const candidates = await prisma.questionBank.findMany({
          where: {
            isActive: true,
            difficulty,
            id: { notIn: usedIds.length > 0 ? usedIds : undefined }
          },
          orderBy: [{ lastUsedAt: "asc" }, { createdAt: "asc" }],
          take: 50
        });
        if (candidates.length > 0) return candidates[randomInt(candidates.length)];
      }
      return null;
    };

    let question = await findCandidate();
    if (!question) {
      await questionGeneratorService.ensureCapacity(allowedDifficulties, 10);
      question = await findCandidate();
    }
    if (!question) {
      throw new Error(`No unused ${gameDifficulty} questions are available in the bank`);
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

  private async persistState(roomId: string, state: GameStateSnapshot): Promise<void> {
    if (!redisService) {
      return;
    }

    await redisService.setJson(`game:${roomId}:state`, state, GAME_STATE_TTL_SECONDS);
  }
}

export const gameOrchestrator = new GameOrchestrator();
