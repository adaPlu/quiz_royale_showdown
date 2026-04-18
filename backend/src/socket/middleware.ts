import type { Socket } from "socket.io";
import jwt from "jsonwebtoken";

import { env } from "../config/env";
import type { AuthedSocketUser } from "../types/contracts";

export const socketAuthMiddleware = (
  socket: Socket,
  next: (error?: Error) => void
): void => {
  const handshakeToken =
    socket.handshake.auth.token ??
    socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (!handshakeToken || typeof handshakeToken !== "string") {
    next(new Error("Missing auth token"));
    return;
  }

  try {
    const decoded = jwt.verify(handshakeToken, env.jwtAccessSecret) as {
      sub: string;
      email: string;
      displayName: string;
    };
    socket.data.user = {
      userId: decoded.sub,
      email: decoded.email,
      displayName: decoded.displayName
    } satisfies AuthedSocketUser;
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
};
