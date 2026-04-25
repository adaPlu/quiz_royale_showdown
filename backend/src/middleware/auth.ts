import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env";
import { AppError, UnauthorizedError } from "../utils/errors";

export type JwtClaims = {
  sub: string;
  email: string;
  displayName: string;
  iat: number;
  exp: number;
};

declare global {
  namespace Express {
    interface Request {
      jwtClaims?: JwtClaims;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    next(new UnauthorizedError("Missing or malformed Authorization header"));
    return;
  }

  const token = authorization.slice(7);

  try {
    req.jwtClaims = jwt.verify(token, env.jwtAccessSecret) as JwtClaims;
    next();
  } catch (error) {
    const isExpired = error instanceof jwt.TokenExpiredError;

    next(
      new AppError(isExpired ? "Access token expired" : "Invalid access token", {
        status: 401,
        code: isExpired ? "TOKEN_EXPIRED" : "INVALID_TOKEN"
      })
    );
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authorization = req.headers.authorization;

  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice(7);

    try {
      req.jwtClaims = jwt.verify(token, env.jwtAccessSecret) as JwtClaims;
    } catch {
      req.jwtClaims = undefined;
    }
  }

  next();
}
