import type { Room, RoomPlayer, User } from "@prisma/client";

import { prisma } from "../models/prismaClient";
import type { PlayerSummary, RoomSnapshot } from "../types/contracts";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors";
import { generateId } from "../utils/ulid";
import { logger } from "../utils/logger";
import { redisService } from "./RedisService";

const DEFAULT_MAX_PLAYERS = 8;
const MAX_PLAYERS_LIMIT = 100;
const ROOM_PLAYERS_TTL_SECONDS = 2 * 60 * 60;
const MATCHMAKING_QUEUE_KEY = "matchmaking:rooms";

type RoomPlayerWithUser = RoomPlayer & {
  user: Pick<User, "id" | "displayName" | "avatarUrl">;
};

type RoomWithPlayers = Room & {
  players: RoomPlayerWithUser[];
};

export interface CreateRoomInput {
  isPrivate?: boolean;
  maxPlayers?: number;
}

export interface JoinRoomResult {
  room: RoomWithPlayers;
  snapshot: RoomSnapshot;
  joined: boolean;
}

export class RoomService {
  async createRoom(hostUserId: string, input: CreateRoomInput = {}): Promise<RoomWithPlayers> {
    const maxPlayers = input.maxPlayers ?? DEFAULT_MAX_PLAYERS;
    this.assertMaxPlayers(maxPlayers);

    const userExists = await prisma.user.findUnique({
      where: { id: hostUserId },
      select: { id: true },
    });
    if (!userExists) {
      throw new NotFoundError("Host user not found");
    }

    const room = await prisma.room.create({
      data: {
        id: generateId(),
        code: await this.generateRoomCode(),
        hostUserId,
        status: "WAITING",
        totalRounds: 10,
        currentRound: 0,
        players: {
          create: {
            id: generateId(),
            userId: hostUserId,
            seatIndex: 0,
          },
        },
      },
      include: this.roomInclude(),
    });

    await this.trackLivePlayer(room.id, hostUserId);

    if (!input.isPrivate) {
      await this.enqueueForMatchmaking(room.id);
    }

    logger.info("Room created", {
      roomId: room.id,
      code: room.code,
      hostUserId,
      isPrivate: input.isPrivate ?? true,
      maxPlayers,
    });

    return room;
  }

  async joinRoom(userId: string, roomCode?: string): Promise<JoinRoomResult> {
    const room = roomCode
      ? await this.findWaitingRoomByCode(roomCode)
      : await this.matchmakeOrCreate(userId);

    const existing = room.players.find((player) => player.userId === userId);
    let joined = false;

    if (!existing) {
      if (room.players.length >= DEFAULT_MAX_PLAYERS) {
        throw new ConflictError("Room is full");
      }

      await prisma.roomPlayer.create({
        data: {
          id: generateId(),
          roomId: room.id,
          userId,
          seatIndex: room.players.length,
        },
      });
      await this.trackLivePlayer(room.id, userId);
      joined = true;
    }

    const refreshed = await this.getRoom(room.id);

    logger.info("Player joined room", { roomId: room.id, userId, joined });

    return {
      room: refreshed,
      snapshot: this.toSnapshot(refreshed),
      joined,
    };
  }

  async getRoom(roomId: string): Promise<RoomWithPlayers> {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: this.roomInclude(),
    });
    if (!room) {
      throw new NotFoundError("Room not found");
    }
    return room;
  }

  async getRoomByCode(roomCode: string): Promise<RoomWithPlayers> {
    const room = await prisma.room.findUnique({
      where: { code: roomCode.toUpperCase() },
      include: this.roomInclude(),
    });
    if (!room) {
      throw new NotFoundError("Room not found");
    }
    return room;
  }

  async getSnapshot(roomId: string): Promise<RoomSnapshot> {
    return this.toSnapshot(await this.getRoom(roomId));
  }

  async startGame(roomId: string, requesterId: string): Promise<RoomWithPlayers> {
    const room = await this.getRoom(roomId);

    if (room.hostUserId !== requesterId) {
      throw new ForbiddenError("Only the room host can start the game");
    }
    if (room.status !== "WAITING") {
      throw new ConflictError("Game already started");
    }

    const activePlayers = room.players.filter((player) => !player.isEliminated);
    if (activePlayers.length < 2) {
      throw new BadRequestError("At least 2 players are required to start");
    }

    await prisma.room.update({
      where: { id: roomId },
      data: { status: "COUNTDOWN", startedAt: new Date() },
    });
    await this.removeFromMatchmaking(roomId);

    logger.info("Game marked started", { roomId, requesterId });

    return this.getRoom(roomId);
  }

  async markReady(roomId: string, userId: string): Promise<{ allReady: boolean; readyPlayerIds: string[] }> {
    const room = await this.getRoom(roomId);

    if (!room.players.some((player) => player.userId === userId)) {
      throw new ForbiddenError("Player is not in this room");
    }

    if (!redisService) {
      return {
        allReady: room.players.filter((player) => !player.isEliminated).length >= 2,
        readyPlayerIds: [userId],
      };
    }

    const readyKey = `room:${roomId}:ready`;
    await redisService.sadd(readyKey, userId);
    await redisService.expire(readyKey, ROOM_PLAYERS_TTL_SECONDS);

    const activePlayers = room.players.filter((player) => !player.isEliminated);
    const readyPlayerIds = await redisService.smembers(readyKey);
    const readySet = new Set(readyPlayerIds);
    const allReady = activePlayers.length >= 2 && activePlayers.every((player) => readySet.has(player.userId));

    return { allReady, readyPlayerIds };
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const room = await this.getRoom(roomId);
    const player = room.players.find((entry) => entry.userId === userId);

    if (!player) {
      throw new NotFoundError("Player is not in this room");
    }

    await prisma.roomPlayer.delete({ where: { id: player.id } });

    if (redisService) {
      await redisService.srem(`room:${roomId}:players`, userId);
      await redisService.srem(`room:${roomId}:ready`, userId);
    }

    const remaining = room.players.filter((entry) => entry.userId !== userId);
    if (remaining.length === 0) {
      await this.removeFromMatchmaking(roomId);
      await prisma.room.delete({ where: { id: roomId } });
      logger.info("Room deleted after final player left", { roomId });
      return;
    }

    if (room.hostUserId === userId) {
      await prisma.room.update({
        where: { id: roomId },
        data: { hostUserId: remaining[0].userId },
      });
      logger.info("Room host transferred", { roomId, hostUserId: remaining[0].userId });
    }
  }

  toSnapshot(room: RoomWithPlayers): RoomSnapshot {
    return {
      roomId: room.id,
      code: room.code,
      phase: room.status,
      roundNumber: room.currentRound,
      totalRounds: room.totalRounds,
      players: room.players
        .slice()
        .sort((left, right) => left.seatIndex - right.seatIndex)
        .map((player): PlayerSummary => ({
          id: player.userId,
          displayName: player.user.displayName,
          avatarUrl: player.user.avatarUrl ?? undefined,
          score: player.score,
          streak: player.streak,
          isEliminated: player.isEliminated,
        })),
    };
  }

  private async findWaitingRoomByCode(roomCode: string): Promise<RoomWithPlayers> {
    const room = await this.getRoomByCode(roomCode);
    if (room.status !== "WAITING") {
      throw new ForbiddenError("Room is no longer accepting players");
    }
    return room;
  }

  private async matchmakeOrCreate(userId: string): Promise<RoomWithPlayers> {
    if (redisService) {
      const candidateIds = await redisService.zrevrange(MATCHMAKING_QUEUE_KEY, 0, -1);
      for (const roomId of candidateIds.reverse()) {
        const room = await prisma.room.findUnique({
          where: { id: roomId },
          include: this.roomInclude(),
        });

        if (!room || room.status !== "WAITING") {
          await redisService.zrem(MATCHMAKING_QUEUE_KEY, roomId);
          continue;
        }

        if (room.players.length < DEFAULT_MAX_PLAYERS) {
          return room;
        }

        await redisService.zrem(MATCHMAKING_QUEUE_KEY, roomId);
      }
    }

    return this.createRoom(userId, { isPrivate: false, maxPlayers: DEFAULT_MAX_PLAYERS });
  }

  private async trackLivePlayer(roomId: string, userId: string): Promise<void> {
    if (!redisService) {
      return;
    }

    const key = `room:${roomId}:players`;
    await redisService.sadd(key, userId);
    await redisService.expire(key, ROOM_PLAYERS_TTL_SECONDS);
    await redisService.zadd(`room:${roomId}:scores`, 0, userId);
  }

  private async enqueueForMatchmaking(roomId: string): Promise<void> {
    if (redisService) {
      await redisService.zadd(MATCHMAKING_QUEUE_KEY, Date.now(), roomId);
    }
  }

  private async removeFromMatchmaking(roomId: string): Promise<void> {
    if (redisService) {
      await redisService.zrem(MATCHMAKING_QUEUE_KEY, roomId);
    }
  }

  private async generateRoomCode(): Promise<string> {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    for (let attempt = 0; attempt < 10; attempt += 1) {
      let code = "";
      for (let index = 0; index < 6; index += 1) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }

      const existing = await prisma.room.findUnique({ where: { code }, select: { id: true } });
      if (!existing) {
        return code;
      }
    }

    throw new ConflictError("Unable to allocate a unique room code");
  }

  private assertMaxPlayers(maxPlayers: number): void {
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > MAX_PLAYERS_LIMIT) {
      throw new BadRequestError(`maxPlayers must be an integer between 2 and ${MAX_PLAYERS_LIMIT}`);
    }
  }

  private roomInclude() {
    return {
      players: {
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
    } as const;
  }
}

export const roomService = new RoomService();
