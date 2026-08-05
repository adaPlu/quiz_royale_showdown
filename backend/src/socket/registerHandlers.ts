import type { Server } from "socket.io";
import { prisma } from "../models/prismaClient";
import { gameOrchestrator } from "../services/GameOrchestrator";
import { redisService } from "../services/RedisService";
import { roomService } from "../services/RoomService";
import type { ClientEvents, ServerEvents, SocketErrorEvent } from "../types/contracts";
import { logger } from "../utils/logger";
import type { AuthenticatedSocket } from "./middleware";
import { buildRoomSnapshot } from "./handlers/playerReady";
import { syncRoomState } from "./handlers/reconnect";
import { registerSubmitAnswerHandler } from "./handlers/submitAnswer";
import { registerUsePowerupHandler } from "./handlers/usePowerup";

const autoStartingRooms = new Set<string>();

const emitEnvelope = (socket: AuthenticatedSocket, envelope: ServerEvents): void => {
  socket.emit("message", envelope);
};

const emitError = (
  socket: AuthenticatedSocket,
  code: string,
  message: string,
  details?: unknown
): void => {
  const envelope: SocketErrorEvent = {
    type: "error",
    version: "v1",
    payload: { code, message, details }
  };

  emitEnvelope(socket, envelope);
};

async function maybeAutoStartRoom(
  io: Server,
  roomId: string,
  hostUserId: string
): Promise<void> {
  if (autoStartingRooms.has(roomId) || gameOrchestrator.hasActiveGame(roomId)) {
    return;
  }

  const connectedSockets = await io.in(roomId).fetchSockets();
  const connectedUserIds = new Set(
    connectedSockets
      .map((connectedSocket) => connectedSocket.data.userId as string | undefined)
      .filter((userId): userId is string => Boolean(userId))
  );

  if (connectedUserIds.size < 2) {
    return;
  }

  autoStartingRooms.add(roomId);

  try {
    await roomService.recoverStaleCountdown(
      roomId,
      gameOrchestrator.hasActiveGame(roomId)
    );

    if (gameOrchestrator.hasActiveGame(roomId)) {
      return;
    }

    const snapshot = await buildRoomSnapshot(roomId);
    if (!snapshot || snapshot.phase !== "WAITING" || snapshot.players.length < 2) {
      return;
    }

    await gameOrchestrator.assertQuestionBankReady();
    await roomService.startGame(roomId, hostUserId);

    const playerRows = await prisma.roomPlayer.findMany({
      where: { roomId },
      select: { userId: true }
    });
    const playerIds = playerRows.map((row) => row.userId);

    void gameOrchestrator.startGame(roomId, playerIds, io).catch((error: unknown) => {
      logger.error("Automatic game start failed", {
        roomId,
        message: error instanceof Error ? error.message : String(error)
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    logger.error("Unable to automatically start ready room", {
      roomId,
      hostUserId,
      message
    });

    const recoveredRoom = await roomService.getRoomById(roomId).catch(() => null);
    if (recoveredRoom) {
      io.to(roomId).emit("message", {
        type: "room:state_sync",
        version: "v1",
        payload: { room: recoveredRoom.room }
      } satisfies ServerEvents);
    }

    io.to(roomId).emit("message", {
      type: "error",
      version: "v1",
      payload: {
        code: "GAME_START_FAILED",
        message
      }
    } satisfies ServerEvents);
  } finally {
    autoStartingRooms.delete(roomId);
  }
}

async function handleRoomJoin(io: Server, socket: AuthenticatedSocket, roomCode: string): Promise<void> {
  const normalizedRoomCode = roomCode.trim().toUpperCase();
  const userId = socket.data.userId;

  const existingRoom = await prisma.room.findUnique({
    where: { code: normalizedRoomCode },
    include: {
      players: {
        select: {
          userId: true
        }
      }
    }
  });

  if (!existingRoom) {
    emitError(socket, "ROOM_NOT_FOUND", `Room ${normalizedRoomCode} not found`);
    return;
  }

  const wasMember = existingRoom.players.some((player) => player.userId === userId);

  if (!wasMember && existingRoom.status !== "WAITING") {
    emitError(socket, "ROOM_NOT_JOINABLE", "Room is no longer accepting new players");
    return;
  }

  if (!wasMember) {
    await roomService.joinRoom(userId, normalizedRoomCode);
  }

  await socket.join(existingRoom.id);
  socket.data.roomId = existingRoom.id;
  socket.data.roomCode = normalizedRoomCode;

  if (redisService) {
    await redisService.del(`room:${existingRoom.id}:player:${userId}:grace`).catch(() => undefined);
  }

  await syncRoomState(socket, existingRoom.id);

  const room = await buildRoomSnapshot(existingRoom.id);
  if (room) {
    // The REST join endpoint normally creates membership before the socket joins.
    // Broadcast an authoritative snapshot even when `wasMember` is true so the
    // host immediately sees the newly connected player.
    const syncEvent: ServerEvents = {
      type: "room:state_sync",
      version: "v1",
      payload: { room }
    };
    socket.to(existingRoom.id).emit("message", syncEvent);

    if (!wasMember) {
      const joinedPlayer = room.players.find((player) => player.id === userId);

      if (joinedPlayer) {
        const joinedEvent: ServerEvents = {
          type: "room:player_joined",
          version: "v1",
          payload: {
            roomId: existingRoom.id,
            player: joinedPlayer
          }
        };

        socket.to(existingRoom.id).emit("message", joinedEvent);
      }
    }

    if (room.phase === "WAITING" && room.players.length >= 2) {
      await maybeAutoStartRoom(io, existingRoom.id, existingRoom.hostUserId);
    }
  }
}

export function registerSocketHandlers(io: Server, socket: AuthenticatedSocket): void {
  registerSubmitAnswerHandler(io, socket);
  registerUsePowerupHandler(io, socket);

  socket.on("message", async (message: ClientEvents) => {
    // Treat absence of `version` field as "v1" so Android clients (which omit
    // the field) are not silently rejected.
    if (!message || (message.version !== undefined && message.version !== "v1")) {
      emitError(socket, "UNSUPPORTED_VERSION", "Unsupported socket message envelope");
      return;
    }

    try {
      logger.debug("Socket message received", { socketId: socket.id, type: message.type });
      switch (message.type) {
        case "room:join":
          await handleRoomJoin(io, socket, message.payload.roomCode);
          return;

        case "client:heartbeat":
          if (socket.data.roomId && socket.data.roomId !== message.payload.roomId) {
            emitError(socket, "ROOM_MISMATCH", "Heartbeat room does not match joined room");
          }
          return;

        default:
          return;
      }
    } catch (error) {
      logger.error("Socket message handling failed", {
        socketId: socket.id,
        userId: socket.data.userId,
        type: message.type,
        message: error instanceof Error ? error.message : String(error)
      });

      emitError(socket, "INTERNAL_ERROR", "Failed to process socket message");
    }
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    const userId = socket.data.userId;

    if (!roomId) {
      return;
    }

    if (redisService) {
      void redisService.set(`room:${roomId}:player:${userId}:grace`, "1", 30).catch(() => undefined);
      return;
    }

    const leftEvent: ServerEvents = {
      type: "room:player_left",
      version: "v1",
      payload: {
        roomId,
        playerId: userId
      }
    };

    socket.to(roomId).emit("message", leftEvent);
  });
}
