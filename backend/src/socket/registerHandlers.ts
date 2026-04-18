import type { Server, Socket } from "socket.io";

import { roomStore } from "../services/RoomStore";
import type { ClientEvents, EventEnvelope, RoomSnapshot, ServerEvents } from "../types/contracts";

const emitEnvelope = <T extends ServerEvents>(socket: Socket, envelope: T): void => {
  socket.emit("message", envelope);
};

const emitPlayerLeft = (io: Server, roomCode: string, playerId: string) => {
  io.to(roomCode).emit("message", {
    type: "room:player_left",
    version: "v1",
    payload: {
      roomId: roomCode,
      playerId
    }
  } satisfies EventEnvelope<"room:player_left", { playerId: string; roomId: string }>);
};

const leaveCurrentRoom = (io: Server, socket: Socket): void => {
  const currentRoom = socket.data.currentRoom as RoomSnapshot | undefined;
  if (!currentRoom) {
    return;
  }

  socket.leave(currentRoom.code);
  const result = roomStore.leaveRoom(currentRoom.roomId, socket.data.user.userId);
  socket.data.currentRoom = undefined;

  if (result.removed) {
    emitPlayerLeft(io, currentRoom.code, socket.data.user.userId);
  }
};

export const registerSocketHandlers = (io: Server): void => {
  io.on("connection", (socket) => {
    socket.on("message", (message: ClientEvents) => {
      if (!message || message.version !== "v1") {
        return;
      }

      if (message.type === "room:join") {
        const roomCode = message.payload.roomCode.toUpperCase();
        leaveCurrentRoom(io, socket);
        const joined = roomStore.joinRoom(roomCode, {
          id: socket.data.user.userId,
          displayName: socket.data.user.displayName
        });
        if (!joined) {
          return;
        }

        void socket.join(roomCode);
        socket.data.currentRoom = joined.room;
        emitEnvelope(socket, {
          type: "room:state_sync",
          version: "v1",
          payload: {
            room: joined.room
          }
        });
        socket.to(roomCode).emit("message", {
          type: "room:player_joined",
          version: "v1",
          payload: {
            roomId: joined.room.roomId,
            player: joined.player
          }
        } satisfies EventEnvelope<"room:player_joined", { player: RoomSnapshot["players"][number]; roomId: string }>);
        return;
      }

      if (message.type === "client:heartbeat") {
        return;
      }
    });

    socket.on("disconnect", () => {
      leaveCurrentRoom(io, socket);
    });
  });
};
