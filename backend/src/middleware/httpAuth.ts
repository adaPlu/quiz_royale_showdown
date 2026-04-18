import type { NextFunction, Request, Response } from "express";

import { authStore } from "../services/AuthStore";
import { verifyAccessToken } from "../services/AuthTokenService";

export type AuthenticatedRequest = Request & {
  authUser: {
    id: string;
    email: string;
    displayName: string;
  };
};

export const requireHttpAuth = (req: Request, res: Response, next: NextFunction): void => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const accessToken = authorization.replace(/^Bearer\s+/i, "");

  try {
    const claims = verifyAccessToken(accessToken);
    const user = authStore.findById(claims.sub);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    (req as AuthenticatedRequest).authUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired access token" });
  }
};
