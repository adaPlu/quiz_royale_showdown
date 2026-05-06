/**
 * Socket.IO authentication middleware.
 *
 * Verifies JWT from `socket.handshake.auth.token` or `Authorization: Bearer` header
 * and stores the contract-facing user fields on `socket.data`.
 */

import type { Socket } from "socket.io";
import { prisma } from "../models/prismaClient";
import { verifyAccessToken } from "../services/AuthService";
import { logger } from "../utils/logger";

export interface AuthenticatedSocketData {
  userId: string;
  displayName: string;
  email: string;
  roomId?: string;
  roomCode?: string;
}

export interface AuthenticatedSocket extends Socket {
  data: Socket["data"] & AuthenticatedSocketData;
}

export const socketAuthMiddleware = async (
  socket: Socket,
  next: (error?: Error) => void
): Promise<void> => {
  try {
    const authToken = socket.handshake.auth?.token;
    const authHeader = socket.handshake.headers.authorization;
    const rawToken =
      (typeof authToken === "string" ? authToken : undefined) ??
      (typeof authHeader === "string" ? authHeader.replace(/^Bearer\s+/i, "") : undefined);

    if (!rawToken) {
      return next(new Error("Missing auth token"));
    }

    const payload = verifyAccessToken(rawToken);

    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, displayName: true, email: true }
      });

      if (!dbUser) {
        return next(new Error("User not found"));
      }

      socket.data.userId = dbUser.id;
      socket.data.displayName = dbUser.displayName;
      socket.data.email = dbUser.email;
    } catch {
      return next(new Error("AUTH_DB_ERROR"));
    }

    logger.debug("Socket authenticated", {
      socketId: socket.id,
      userId: socket.data.userId
    });

    next();
  } catch {
    next(new Error("Unauthorized"));
  }
};
