import type { Socket } from "socket.io";

import { prisma } from "../models/prismaClient";
import { verifyAccessToken } from "../services/AuthService";
import type { AuthedSocketUser } from "../types/contracts";
import { logger } from "../utils/logger";

export const socketAuthMiddleware = async (
  socket: Socket,
  next: (error?: Error) => void
): Promise<void> => {
  const handshakeToken =
    socket.handshake.auth.token ??
    socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (!handshakeToken || typeof handshakeToken !== "string") {
    next(new Error("Missing auth token"));
    return;
  }

  try {
    const decoded = verifyAccessToken(handshakeToken);
    const dbUser = await prisma.user
      .findUnique({
        where: { id: decoded.sub },
        select: { id: true, email: true, displayName: true },
      })
      .catch((error: unknown) => {
        logger.warn("Socket auth DB lookup failed; using token claims", {
          message: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
    const user = dbUser
      ? { userId: dbUser.id, email: dbUser.email, displayName: dbUser.displayName }
      : { userId: decoded.sub, email: decoded.email, displayName: decoded.displayName };

    socket.data.user = user satisfies AuthedSocketUser;
    socket.data.userId = user.userId;
    socket.data.email = user.email;
    socket.data.displayName = user.displayName;

    logger.debug("Socket authenticated", { socketId: socket.id, userId: user.userId });
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
};
