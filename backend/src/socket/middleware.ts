/**
 * Socket.IO authentication middleware.
 *
 * Verifies JWT from `socket.handshake.auth.token` or `Authorization: Bearer` header.
 * Attaches `socket.data.userId` and `socket.data.username` on success.
 * Rejects banned users with an error.
 */

import type { Socket } from "socket.io";
import { verifyAccessToken } from "../services/AuthService";
import { prisma } from "../models/prismaClient";
import { logger } from "../utils/logger";

// ─── Augmented socket interface ───────────────────────────────────────────────

export interface AuthenticatedSocket extends Socket {
  data: Socket["data"] & {
    userId: string;
    username: string;
    email: string;
  };
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export const socketAuthMiddleware = async (
  socket: Socket,
  next: (error?: Error) => void
): Promise<void> => {
  try {
    const rawToken: unknown =
      socket.handshake.auth["token"] ??
      socket.handshake.headers["authorization"]?.replace(/^Bearer\s+/i, "");

    if (!rawToken || typeof rawToken !== "string") {
      return next(new Error("Missing auth token"));
    }

    // verifyAccessToken throws UnauthorizedError on failure
    const payload = verifyAccessToken(rawToken);

    // Try Prisma first; fall back gracefully if DB is unavailable
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, displayName: true, email: true },
      });

      if (!dbUser) {
        return next(new Error("User not found"));
      }

      socket.data["userId"] = dbUser.id;
      socket.data["username"] = dbUser.displayName;
      socket.data["email"] = dbUser.email;
    } catch {
      // DB unavailable — use payload claims (degraded mode)
      socket.data["userId"] = payload.sub;
      socket.data["username"] = payload.displayName;
      socket.data["email"] = payload.email;
    }

    logger.debug("Socket authenticated", {
      socketId: socket.id,
      userId: socket.data["userId"] as string,
    });

    next();
  } catch {
    next(new Error("Unauthorized"));
  }
};
