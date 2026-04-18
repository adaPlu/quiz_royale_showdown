/**
 * Express JWT bearer middleware for REST routes.
 *
 * Verifies the Authorization: Bearer <token> header and attaches the
 * decoded claims to req.  Works independently of AuthStore — verifies
 * signature only, so it is stateless.
 *
 * For routes that also need the full user record from the database,
 * use the Prisma-aware version in a route-level middleware.
 */

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { UnauthorizedError } from "../utils/errors";

export type JwtClaims = {
  sub: string;
  email: string;
  displayName: string;
  iat: number;
  exp: number;
};

/** Extend Express Request to carry the decoded token claims. */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      jwtClaims?: JwtClaims;
    }
  }
}

/**
 * Middleware: verifies the access token and attaches `req.jwtClaims`.
 * Responds 401 if the token is missing, malformed, or expired.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    const err = new UnauthorizedError("Missing or malformed Authorization header");
    res.status(401).json({ error: err.message, code: err.code });
    return;
  }

  const token = authorization.slice(7);

  try {
    const claims = jwt.verify(token, env.jwtAccessSecret) as JwtClaims;
    req.jwtClaims = claims;
    next();
  } catch (error) {
    const isExpired = error instanceof jwt.TokenExpiredError;
    const message = isExpired ? "Access token expired" : "Invalid access token";
    const code = isExpired ? "TOKEN_EXPIRED" : "INVALID_TOKEN";
    res.status(401).json({ error: message, code });
  }
}

/**
 * Optional auth middleware — attaches claims if the header is present
 * but does not reject requests missing the header.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authorization = req.headers.authorization;

  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice(7);
    try {
      req.jwtClaims = jwt.verify(token, env.jwtAccessSecret) as JwtClaims;
    } catch {
      // token is present but invalid — leave jwtClaims undefined
    }
  }

  next();
}
