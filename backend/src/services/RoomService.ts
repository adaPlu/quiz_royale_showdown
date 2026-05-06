/**
 * RoomService - create, query, start, join, and leave rooms.
 *
 * Durable room state lives in Prisma (Postgres).
 * Fast-changing lifecycle metadata lives in Redis.
 */

import { randomInt } from "crypto";

import { Prisma, type Room } from "@prisma/client";

import { prisma } from "../models/prismaClient";
import type { PlayerSummary, RoomSnapshot } from "../types/contracts";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../utils/errors";
import { logger } from "../utils/logger";
import { isValidId } from "../utils/ulid";
import { generateId } from "../utils/ulid";
import { signTokenPair } from "./AuthService";
import { redisService } from "./RedisService";

const BOT_FILL_DELAY_MS = 10_000;
const BOT_PLAYER_ID_PREFIX = "bot:";

interface CreateRoomOpts {
  isPrivate: boolean;
  maxPlayers: number;
}

interface RoomConfig {
  isPrivate: boolean;
  maxPlayers: number;
}

export interface RoomLifecycleState {
  room: RoomSnapshot;
  hostUserId: string;
  config: RoomConfig;
  createdAt: string;
  startedAt: string | null;
}

export interface LeaveRoomResult {
  left: true;
  roomId: string;
  roomClosed: boolean;
  room: RoomSnapshot | null;
  hostUserId: string | null;
  config: RoomConfig | null;
  createdAt: string | null;
  startedAt: string | null;
}

const MATCHMAKING_QUEUE_KEY = "matchmaking:queue";
const ROOM_PLAYERS_TTL_SECONDS = 60 * 60 * 2;
const DEFAULT_ROOM_CONFIG: RoomConfig = {
  isPrivate: true,
  maxPlayers: 8,
};

const roomWithPlayersInclude = Prisma.validator<Prisma.RoomInclude>()({
  players: {
    orderBy: { seatIndex: "asc" },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  },
});

type RoomWithPlayers = Prisma.RoomGetPayload<{
  include: typeof roomWithPlayersInclude;
}>;

export class RoomService {
  async createRoom(
    hostUserId: string,
    opts: Partial<CreateRoomOpts> = {}
  ): Promise<RoomLifecycleState> {
    const config = this.normalizeRoomConfig(opts);
    const room = await this.createRoomEntity(hostUserId, config);
    return this.toLifecycleState(room, config);
  }

  /**
   * Join a room by code (private) or via the matchmaking queue (public).
   * Returns the room row and a short-lived token for the WebSocket handshake.
   */
  async joinRoom(
    userId: string,
    roomCode?: string
  ): Promise<{ room: Room; wsToken: string }> {
    let room: Room;

    if (roomCode) {
      const found = await prisma.room.findUnique({
        where: { code: roomCode.toUpperCase() },
      });

      if (!found) {
        throw new NotFoundError(`Room with code ${roomCode} not found`);
      }

      if (found.status !== "WAITING") {
        throw new ForbiddenError("Room is no longer accepting players");
      }

      room = found;
    } else {
      room = await this.matchmakeOrCreate(userId);
    }

    const config = await this.getRoomConfig(room.id);

    const joinResult = await prisma.$transaction(async (tx) => {
      // Re-read inside transaction for accurate seat count
      const freshRoom = await tx.room.findUnique({
        where: { id: room.id },
        include: { players: { select: { userId: true } } },
      });
      if (!freshRoom) throw new NotFoundError("Room no longer exists");

      const alreadyIn = freshRoom.players.some((p) => p.userId === userId);
      if (alreadyIn) {
        return { alreadyJoined: true };
      }

      if (freshRoom.players.length >= (config.maxPlayers ?? 8)) {
        throw new ConflictError("Room is full");
      }

      await tx.roomPlayer.create({
        data: {
          id: generateId(),
          roomId: room.id,
          userId,
          seatIndex: freshRoom.players.length,
        },
      });

      return { alreadyJoined: false };
    });

    if (!joinResult.alreadyJoined) {
      await this.addLivePlayer(room.id, userId);
      logger.info("Player joined room", { userId, roomId: room.id });
    }

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, displayName: true },
    });
    const { accessToken: wsToken } = signTokenPair(user);

    return { room, wsToken };
  }

  async getRoomByCode(roomCode: string): Promise<RoomLifecycleState> {
    const normalizedCode = roomCode.trim().toUpperCase();
    const room = await prisma.room.findUnique({
      where: { code: normalizedCode },
      include: roomWithPlayersInclude,
    });

    if (!room) {
      throw new NotFoundError(`Room with code ${normalizedCode} not found`);
    }

    return this.toLifecycleState(room);
  }

  async getRoomById(roomId: string): Promise<RoomLifecycleState> {
    if (!isValidId(roomId)) {
      throw new NotFoundError(`Room ${roomId} not found`);
    }

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: roomWithPlayersInclude,
    });

    if (!room) {
      throw new NotFoundError(`Room ${roomId} not found`);
    }

    return this.toLifecycleState(room);
  }

  async recoverStaleCountdown(roomId: string, hasActiveGame: boolean): Promise<boolean> {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, status: true },
    });

    if (!room || room.status !== "COUNTDOWN" || hasActiveGame) {
      return false;
    }

    const liveState = redisService
      ? await redisService.getJson<unknown>(`game:${roomId}:state`)
      : null;

    if (liveState) {
      return false;
    }

    const result = await prisma.room.updateMany({
      where: { id: roomId, status: "COUNTDOWN" },
      data: {
        status: "WAITING",
        startedAt: null,
      },
    });

    if (result.count === 0) {
      return false;
    }

    if (redisService) {
      await redisService.del(
        `game:${roomId}:state`,
        `game:${roomId}:current_question`,
        `room:${roomId}:scores`
      );
    }

    logger.warn("Recovered stale COUNTDOWN room", { roomId });
    return true;
  }

  async resetStartFailure(roomId: string, reason: string): Promise<void> {
    await prisma.room.updateMany({
      where: { id: roomId, status: "COUNTDOWN" },
      data: {
        status: "WAITING",
        startedAt: null,
      },
    });

    if (redisService) {
      await redisService.del(
        `game:${roomId}:state`,
        `game:${roomId}:current_question`,
        `room:${roomId}:scores`
      );
    }

    logger.warn("Reset room after game start failure", { roomId, reason });
  }

  async startGame(roomId: string, requesterId: string): Promise<RoomLifecycleState> {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: roomWithPlayersInclude,
    });

    if (!room) {
      throw new NotFoundError(`Room ${roomId} not found`);
    }

    if (room.hostUserId !== requesterId) {
      throw new ForbiddenError("Only the host can start the game");
    }

    if (room.status !== "WAITING") {
      throw new ConflictError("Game has already started");
    }

    if (room.players.length < 2) {
      throw new BadRequestError("At least 2 players are required to start");
    }

    await prisma.room.update({
      where: { id: roomId },
      data: {
        status: "COUNTDOWN",
        startedAt: new Date(),
      },
    });

    logger.info("Game started", { roomId, hostUserId: requesterId });

    return this.getRoomById(roomId);
  }

  /**
   * Wait up to BOT_FILL_DELAY_MS for a second human player to join.
   * If only 1 human player remains after the delay, inject a bot entry
   * into Redis so the game can proceed.
   *
   * Returns the full list of player IDs (including any bot) that should
   * be passed to GameOrchestrator.startGame.
   */
  async waitForPlayersOrFillBots(roomId: string, humanPlayerIds: string[]): Promise<string[]> {
    await new Promise<void>((resolve) => setTimeout(resolve, BOT_FILL_DELAY_MS));

    if (!redisService) {
      return humanPlayerIds;
    }

    // Check current live player count
    const liveCount = await redisService.scard(`room:${roomId}:players`);

    if (liveCount >= 2) {
      // Enough human players — no bot needed
      const members = await redisService.smembers(`room:${roomId}:players`);
      return members;
    }

    // Only 1 human — add a bot
    const botId = `${BOT_PLAYER_ID_PREFIX}${generateId()}`;
    const botEntry = JSON.stringify({ id: botId, displayName: "QuizBot", isBot: true });

    await redisService.sadd(`room:${roomId}:players`, botId);
    await redisService.setJson(`room:${roomId}:bot:${botId}`, JSON.parse(botEntry), 7200);

    logger.info("Bot added to room for solo matchmaking", { roomId, botId });

    const members = await redisService.smembers(`room:${roomId}:players`);
    return members;
  }

  async leaveRoom(roomId: string, userId: string): Promise<LeaveRoomResult> {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: roomWithPlayersInclude,
    });

    if (!room) {
      throw new NotFoundError(`Room ${roomId} not found`);
    }

    const playerRecord = room.players.find((player) => player.userId === userId);
    if (!playerRecord) {
      throw new NotFoundError("You are not in this room");
    }

    const config = await this.getRoomConfig(room.id);

    await prisma.roomPlayer.delete({
      where: { id: playerRecord.id },
    });

    await this.removeLivePlayer(room.id, userId);

    const remainingPlayers = [...room.players]
      .filter((player) => player.userId !== userId)
      .sort((left, right) => left.seatIndex - right.seatIndex);

    if (remainingPlayers.length === 0) {
      await prisma.room.delete({ where: { id: roomId } });
      await this.clearRoomCache(roomId);

      logger.info("Room deleted after final player left", { roomId });

      return {
        left: true,
        roomId,
        roomClosed: true,
        room: null,
        hostUserId: null,
        config: null,
        createdAt: null,
        startedAt: null,
      };
    }

    if (room.hostUserId === userId) {
      await prisma.room.update({
        where: { id: roomId },
        data: { hostUserId: remainingPlayers[0].userId },
      });

      logger.info("Room host transferred", {
        roomId,
        fromUserId: userId,
        toUserId: remainingPlayers[0].userId,
      });
    }

    logger.info("Player left room", { roomId, userId });

    const updatedRoom = await this.getRoomById(roomId);

    return {
      left: true,
      roomId,
      roomClosed: false,
      room: updatedRoom.room,
      hostUserId: updatedRoom.hostUserId,
      config,
      createdAt: updatedRoom.createdAt,
      startedAt: updatedRoom.startedAt,
    };
  }

  private async matchmakeOrCreate(userId: string): Promise<Room> {
    if (redisService) {
      const candidates = await redisService.zrevrange(MATCHMAKING_QUEUE_KEY, -1, -1);
      const candidateRoomId = candidates[0];

      if (candidateRoomId) {
        const room = await prisma.room.findUnique({ where: { id: candidateRoomId } });

        if (room && room.status === "WAITING") {
          const count = await prisma.roomPlayer.count({ where: { roomId: room.id } });
          const config = await this.getRoomConfig(room.id);

          if (count >= config.maxPlayers) {
            await redisService.zrem(MATCHMAKING_QUEUE_KEY, candidateRoomId);
          } else {
            return room;
          }
        } else {
          await redisService.zrem(MATCHMAKING_QUEUE_KEY, candidateRoomId);
        }
      }
    }

    const room = await this.createRoomEntity(userId, {
      isPrivate: false,
      maxPlayers: DEFAULT_ROOM_CONFIG.maxPlayers,
    });

    if (redisService) {
      await redisService.zadd(MATCHMAKING_QUEUE_KEY, Date.now(), room.id);
    }

    return room;
  }

  private normalizeRoomConfig(opts: Partial<CreateRoomOpts>): RoomConfig {
    const config: RoomConfig = {
      isPrivate: opts.isPrivate ?? DEFAULT_ROOM_CONFIG.isPrivate,
      maxPlayers: opts.maxPlayers ?? DEFAULT_ROOM_CONFIG.maxPlayers,
    };

    if (config.maxPlayers < 2 || config.maxPlayers > 100) {
      throw new BadRequestError("maxPlayers must be between 2 and 100");
    }

    return config;
  }

  private async createRoomEntity(
    hostUserId: string,
    config: RoomConfig
  ): Promise<RoomWithPlayers> {
    const code = await this.generateRoomCode();
    const roomId = generateId();

    await prisma.$transaction(async (tx) => {
      await tx.room.create({
        data: {
          id: roomId,
          code,
          hostUserId,
          status: "WAITING",
          totalRounds: 10,
          currentRound: 0,
        },
      });

      await tx.roomPlayer.create({
        data: {
          id: generateId(),
          roomId,
          userId: hostUserId,
          seatIndex: 0,
        },
      });
    });

    await Promise.all([
      this.addLivePlayer(roomId, hostUserId),
      this.setRoomConfig(roomId, config),
    ]);

    logger.info("Room created", {
      roomId,
      code,
      hostUserId,
      isPrivate: config.isPrivate,
      maxPlayers: config.maxPlayers,
    });

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: roomWithPlayersInclude,
    });

    if (!room) {
      throw new NotFoundError(`Room ${roomId} not found after creation`);
    }

    return room;
  }

  private async addLivePlayer(roomId: string, userId: string): Promise<void> {
    if (!redisService) {
      return;
    }

    await redisService.sadd(`room:${roomId}:players`, userId);
    await redisService.expire(`room:${roomId}:players`, ROOM_PLAYERS_TTL_SECONDS);
  }

  private async removeLivePlayer(roomId: string, userId: string): Promise<void> {
    if (!redisService) {
      return;
    }

    await redisService.srem(`room:${roomId}:players`, userId);
  }

  private async setRoomConfig(roomId: string, config: RoomConfig): Promise<void> {
    if (!redisService) {
      return;
    }

    await redisService.setJson(
      `room:${roomId}:config`,
      config,
      ROOM_PLAYERS_TTL_SECONDS
    );
  }

  private async getRoomConfig(roomId: string): Promise<RoomConfig> {
    if (!redisService) {
      return DEFAULT_ROOM_CONFIG;
    }

    const config = await redisService.getJson<RoomConfig>(`room:${roomId}:config`);
    return config ?? DEFAULT_ROOM_CONFIG;
  }

  private async clearRoomCache(roomId: string): Promise<void> {
    if (!redisService) {
      return;
    }

    await redisService.del(`room:${roomId}:players`, `room:${roomId}:config`);
  }

  private async toLifecycleState(
    room: RoomWithPlayers,
    configOverride?: RoomConfig
  ): Promise<RoomLifecycleState> {
    const config = configOverride ?? (await this.getRoomConfig(room.id));

    return {
      room: {
        roomId: room.id,
        code: room.code,
        hostId: room.hostUserId,
        phase: room.status,
        roundNumber: room.currentRound,
        totalRounds: room.totalRounds,
        players: room.players.map((player) => this.toPlayerSummary(player)),
      },
      hostUserId: room.hostUserId,
      config,
      createdAt: room.createdAt.toISOString(),
      startedAt: room.startedAt?.toISOString() ?? null,
    };
  }

  private toPlayerSummary(
    player: RoomWithPlayers["players"][number]
  ): PlayerSummary {
    return {
      id: player.user.id,
      displayName: player.user.displayName,
      avatarUrl: player.user.avatarUrl ?? undefined,
      score: player.score,
      streak: player.streak,
      isEliminated: player.isEliminated,
    };
  }

  private async generateRoomCode(): Promise<string> {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const maxAttempts = 10;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      let code = "";

      for (let index = 0; index < 6; index += 1) {
        code += chars[randomInt(chars.length)];
      }

      const existing = await prisma.room.findUnique({ where: { code } });
      if (!existing) {
        return code;
      }
    }

    throw new Error("Failed to generate a unique room code after maximum attempts");
  }
}

export const roomService = new RoomService();
