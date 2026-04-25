import type { Server } from "socket.io";
import { prisma } from "../models/prismaClient";
import { roomService } from "../services/RoomService";
import type { ClientEvents, ServerEvents, SocketErrorEvent } from "../types/contracts";
import { logger } from "../utils/logger";
import type { AuthenticatedSocket } from "./middleware";
import { buildRoomSnapshot } from "./handlers/playerReady";
import { syncRoomState } from "./handlers/reconnect";
import { registerSubmitAnswerHandler } from "./handlers/submitAnswer";
import { registerUsePowerupHandler } from "./handlers/usePowerup";

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

  await syncRoomState(socket, existingRoom.id);

  if (!wasMember) {
    const room = await buildRoomSnapshot(existingRoom.id);

    if (room) {
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

    if (!roomId) {
      return;
    }

    const leftEvent: ServerEvents = {
      type: "room:player_left",
      version: "v1",
      payload: {
        roomId,
        playerId: socket.data.userId
      }
    };

    socket.to(roomId).emit("message", leftEvent);
  });
}
