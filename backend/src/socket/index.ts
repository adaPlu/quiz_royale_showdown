import type { Server } from "socket.io";
import { logger } from "../utils/logger";
import type { AuthenticatedSocket } from "./middleware";
import { socketAuthMiddleware } from "./middleware";
import { registerSocketHandlers } from "./registerHandlers";

let _io: Server | undefined;

/** Returns the Socket.IO server instance (available after initSocketServer is called). */
export function getIo(): Server {
  if (!_io) {
    throw new Error("Socket.IO server has not been initialized yet");
  }
  return _io;
}

export function initSocketServer(io: Server): void {
  _io = io;
  io.use(socketAuthMiddleware);

  io.on("connection", (rawSocket) => {
    const socket = rawSocket as AuthenticatedSocket;

    logger.info("Socket connected", {
      socketId: socket.id,
      userId: socket.data.userId,
      displayName: socket.data.displayName
    });

    registerSocketHandlers(io, socket);

    socket.on("error", (error: Error) => {
      logger.error("Socket error", {
        socketId: socket.id,
        userId: socket.data.userId,
        message: error.message
      });
    });
  });
}
