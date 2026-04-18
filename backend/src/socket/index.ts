/**
 * Socket.IO server setup.
 *
 * Registers the auth middleware and routes all WS events to their handlers.
 * Non-fatal handler exceptions are caught and broadcast as `v1:error`.
 */

import type { Server, Socket } from "socket.io";
import { socketAuthMiddleware } from "./middleware";
import { registerPlayerReadyHandler } from "./handlers/playerReady";
import { registerSubmitAnswerHandler } from "./handlers/submitAnswer";
import { registerUsePowerupHandler } from "./handlers/usePowerup";
import { registerReconnectHandler } from "./handlers/reconnect";
import { logger } from "../utils/logger";

export function initSocketServer(io: Server): void {
  // Register JWT auth middleware on every connection
  io.use(socketAuthMiddleware);

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as string | undefined;
    const username = socket.data.username as string | undefined;

    logger.info("Socket connected", { socketId: socket.id, userId, username });

    // Register event handlers
    registerPlayerReadyHandler(io, socket);
    registerSubmitAnswerHandler(io, socket);
    registerUsePowerupHandler(io, socket);
    registerReconnectHandler(io, socket);

    socket.on("disconnect", (reason: string) => {
      logger.info("Socket disconnected", { socketId: socket.id, userId, reason });
    });

    socket.on("error", (err: Error) => {
      logger.error("Socket error", {
        socketId: socket.id,
        userId,
        message: err.message,
      });
    });
  });
}
