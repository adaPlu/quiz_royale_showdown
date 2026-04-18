/**
 * RoomService — create, join, query, start, and leave rooms.
 *
 * Room state is persisted in Prisma (Postgres).
 * The live player list and matchmaking queue are tracked in Redis.
 */

import type { Room, RoomPlayer } from "@prisma/client";
import { prisma } from "../models/prismaClient";
import { redisService } from "./RedisService";
import { signTokenPair } from "./AuthService";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
} from "../utils/errors";
import { generateId } from "../utils/ulid";
import { logger } from "../utils/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateRoomOpts {
  isPrivate: boolean;
  maxPlayers: number;
}

type RoomWithPlayers = Room & { players: RoomPlayer[] };

const MATCHMAKING_QUEUE_KEY = "matchmaking:queue";
const ROOM_PLAYERS_TTL = 7200; // 2 hours

// ─── Service ─────────────────────────────────────────────────────────────────

export class RoomService {
  /**
   * Create a new room, set the creator as host, return the persisted Room.
   */
  async createRoom(hostUserId: string, opts: CreateRoomOpts): Promise<Room> {
    const { isPrivate, maxPlayers } = opts;

    if (maxPlayers < 2 || maxPlayers > 100) {
      throw new BadRequestError("maxPlayers must be between 2 and 100");
    }

    const code = await this.generateRoomCode();
    const roomId = generateId();

    const room = await prisma.room.create({
      data: {
        id: roomId,
        code,
        hostUserId,
        status: "WAITING",
        totalRounds: 10,
        currentRound: 0,
      },
    });

    // Add host as first player
    await prisma.roomPlayer.create({
      data: {
        id: generateId(),
        roomId: room.id,
        userId: hostUserId,
        seatIndex: 0,
      },
    });

    // Track live player in Redis
    if (redisService) {
      await redisService.sadd(`room:${roomId}:players`, hostUserId);
      await redisService.expire(`room:${roomId}:players`, ROOM_PLAYERS_TTL);
    }

    logger.info("Room created", { roomId, code, hostUserId, isPrivate });

    return room;
  }

  /**
   * Join a room by code (private) or via the matchmaking queue (public).
   * Returns the room and a short-lived wsToken for the WebSocket handshake.
   */
  async joinRoom(
    userId: string,
    roomCode?: string
  ): Promise<{ room: Room; wsToken: string }> {
    let room: Room;

    if (roomCode) {
      // Private join by code
      const found = await prisma.room.findUnique({ where: { code: roomCode.toUpperCase() } });
      if (!found) throw new NotFoundError(`Room with code ${roomCode} not found`);
      if (found.status !== "WAITING") {
        throw new ForbiddenError("Room is no longer accepting players");
      }
      room = found;
    } else {
      // Matchmaking: pop from queue or create new room
      room = await this.matchmakeOrCreate(userId);
    }

    // Ensure player isn't already in the room
    const existing = await prisma.roomPlayer.findUnique({
      where: { roomId_userId: { roomId: room.id, userId } },
    });

    if (!existing) {
      const seatCount = await prisma.roomPlayer.count({ where: { roomId: room.id } });
      await prisma.roomPlayer.create({
        data: {
          id: generateId(),
          roomId: room.id,
          userId,
          seatIndex: seatCount,
        },
      });

      // Update Redis live player list
      if (redisService) {
        await redisService.sadd(`room:${room.id}:players`, userId);
        await redisService.expire(`room:${room.id}:players`, ROOM_PLAYERS_TTL);
      }

      logger.info("Player joined room", { userId, roomId: room.id });
    }

    // Issue a short-lived wsToken for the handshake
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, displayName: true },
    });
    const { accessToken: wsToken } = signTokenPair(user);

    return { room, wsToken };
  }

  /**
   * Get a room along with its current player list.
   */
  async getRoom(roomId: string): Promise<RoomWithPlayers> {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { players: true },
    });

    if (!room) throw new NotFoundError(`Room ${roomId} not found`);
    return room;
  }

  /**
   * Start the game (host only). Transitions room to COUNTDOWN.
   */
  async startGame(roomId: string, requesterId: string): Promise<void> {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { players: true },
    });

    if (!room) throw new NotFoundError(`Room ${roomId} not found`);
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
      data: { status: "COUNTDOWN", startedAt: new Date() },
    });

    logger.info("Game started", { roomId, hostUserId: requesterId });
  }

  /**
   * Leave a room. If the leaver is the host, transfer host to the next player.
   * If the room becomes empty, delete it.
   */
  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { players: true },
    });

    if (!room) throw new NotFoundError(`Room ${roomId} not found`);

    const playerRecord = room.players.find((p) => p.userId === userId);
    if (!playerRecord) {
      throw new NotFoundError("You are not in this room");
    }

    // Remove player record
    await prisma.roomPlayer.delete({ where: { id: playerRecord.id } });

    // Remove from Redis live set
    if (redisService) {
      await redisService.srem(`room:${room.id}:players`, userId);
    }

    const remaining = room.players.filter((p) => p.userId !== userId);

    if (remaining.length === 0) {
      // Delete room entirely
      await prisma.room.delete({ where: { id: roomId } });
      logger.info("Room deleted (empty)", { roomId });
      return;
    }

    // Transfer host if needed
    if (room.hostUserId === userId) {
      const newHost = remaining[0];
      await prisma.room.update({
        where: { id: roomId },
        data: { hostUserId: newHost.userId },
      });
      logger.info("Host transferred", { roomId, newHostUserId: newHost.userId });
    }

    logger.info("Player left room", { userId, roomId });
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Find an existing WAITING room from the matchmaking queue or create one.
   */
  private async matchmakeOrCreate(userId: string): Promise<Room> {
    if (redisService) {
      // Pop the oldest room from the sorted-set queue (score = join epoch ms)
      const candidates = await redisService.zrevrange(MATCHMAKING_QUEUE_KEY, -1, -1);
      const candidateRoomId = candidates[0];

      if (candidateRoomId) {
        const room = await prisma.room.findUnique({ where: { id: candidateRoomId } });
        if (room && room.status === "WAITING") {
          // Remove from queue if full (simple heuristic: 8 players)
          const count = await prisma.roomPlayer.count({ where: { roomId: room.id } });
          if (count >= 8) {
            await redisService.zrem(MATCHMAKING_QUEUE_KEY, candidateRoomId);
          }
          return room;
        }
        // Stale entry — remove it
        await redisService.zrem(MATCHMAKING_QUEUE_KEY, candidateRoomId);
      }
    }

    // Create a new public room
    const room = await this.createRoom(userId, { isPrivate: false, maxPlayers: 8 });

    if (redisService) {
      await redisService.zadd(MATCHMAKING_QUEUE_KEY, Date.now(), room.id);
    }

    return room;
  }

  /**
   * Generate a unique 6-character alphanumeric room code.
   */
  private async generateRoomCode(): Promise<string> {
    const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Crockford-safe, no ambiguous chars
    const MAX_ATTEMPTS = 10;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let code = "";
      for (let i = 0; i < 6; i++) {
        code += CHARS[Math.floor(Math.random() * CHARS.length)];
      }

      const existing = await prisma.room.findUnique({ where: { code } });
      if (!existing) return code;
    }

    throw new Error("Failed to generate a unique room code after maximum attempts");
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const roomService = new RoomService();
