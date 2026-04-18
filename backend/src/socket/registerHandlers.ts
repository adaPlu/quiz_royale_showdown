import type { Server, Socket } from "socket.io";

import type { ClientEvents, EventEnvelope, RoomSnapshot, ServerEvents } from "../types/contracts";

const demoRoom = (roomCode: string, socket: Socket): RoomSnapshot => ({
  roomId: roomCode,
  code: roomCode,
  phase: "WAITING",
  roundNumber: 0,
  totalRounds: 10,
  players: [
    {
      id: socket.data.user.userId,
      displayName: socket.data.user.displayName,
      score: 0,
      streak: 0,
      isEliminated: false
    }
  ]
});

const emitEnvelope = <T extends ServerEvents>(socket: Socket, envelope: T): void => {
  socket.emit("message", envelope);
};

export const registerSocketHandlers = (io: Server): void => {
  io.on("connection", (socket) => {
    socket.on("message", (message: ClientEvents) => {
      if (!message || message.version !== "v1") {
        return;
      }

      if (message.type === "room:join") {
        const roomCode = message.payload.roomCode.toUpperCase();
        void socket.join(roomCode);
        emitEnvelope(socket, {
          type: "room:state_sync",
          version: "v1",
          payload: {
            room: demoRoom(roomCode, socket)
          }
        });
        io.to(roomCode).emit("message", {
          type: "room:player_joined",
          version: "v1",
          payload: {
            roomId: roomCode,
            player: {
              id: socket.data.user.userId,
              displayName: socket.data.user.displayName,
              score: 0,
              streak: 0,
              isEliminated: false
            }
          }
        } satisfies EventEnvelope<"room:player_joined", { player: RoomSnapshot["players"][number]; roomId: string }>);
      }
    });
  });
};
