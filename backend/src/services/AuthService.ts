/**
 * AuthService — JWT sign/verify for access + refresh tokens.
 *
 * This is the high-level service layer.  For the in-memory store and
 * token issuance details see AuthStore.ts / AuthTokenService.ts.
 *
 * When Prisma is integrated, this service will delegate to Prisma
 * instead of the in-memory AuthStore.
 */

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { ulid } from "ulid";
import { env } from "../config/env";
import { ConflictError, UnauthorizedError } from "../utils/errors";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
};

export type AuthTokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type JwtPayload = {
  sub: string;
  email: string;
  displayName: string;
  iat?: number;
  exp?: number;
};

// ─── In-memory user store (Phase 0 — replace with Prisma in Phase 1) ────────

type UserRecord = AuthUser & { passwordHash: string };

const users = new Map<string, UserRecord>(); // keyed by id
const emailIndex = new Map<string, string>(); // email → id
const refreshTokens = new Map<string, string>(); // token → userId

const BCRYPT_ROUNDS = 10;

// ─── User lifecycle ──────────────────────────────────────────────────────────

export async function registerUser(
  email: string,
  displayName: string,
  password: string
): Promise<AuthUser> {
  const normalized = email.toLowerCase().trim();

  if (emailIndex.has(normalized)) {
    throw new ConflictError("Email already registered");
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user: UserRecord = {
    id: ulid(),
    email: normalized,
    displayName,
    passwordHash
  };

  users.set(user.id, user);
  emailIndex.set(normalized, user.id);

  return { id: user.id, email: user.email, displayName: user.displayName };
}

export async function loginUser(
  email: string,
  password: string
): Promise<AuthUser> {
  const normalized = email.toLowerCase().trim();
  const userId = emailIndex.get(normalized);

  if (!userId) {
    // Constant-time comparison to prevent user enumeration via timing
    await bcrypt.compare(password, "$2b$10$invalidhashpadding00000000000000000000000000000");
    throw new UnauthorizedError("Invalid credentials");
  }

  const user = users.get(userId);
  if (!user) {
    throw new UnauthorizedError("Invalid credentials");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError("Invalid credentials");
  }

  return { id: user.id, email: user.email, displayName: user.displayName };
}

export function findUserById(id: string): AuthUser | null {
  const user = users.get(id);
  return user ? { id: user.id, email: user.email, displayName: user.displayName } : null;
}

// ─── Token lifecycle ─────────────────────────────────────────────────────────

export function signTokenPair(user: AuthUser): AuthTokenPair {
  const payload: Omit<JwtPayload, "iat" | "exp"> = {
    sub: user.id,
    email: user.email,
    displayName: user.displayName
  };

  const accessToken = jwt.sign(payload, env.jwtAccessSecret, {
    expiresIn: env.jwtAccessTtl as jwt.SignOptions["expiresIn"]
  });

  const refreshToken = jwt.sign(payload, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshTtl as jwt.SignOptions["expiresIn"]
  });

  refreshTokens.set(refreshToken, user.id);

  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, env.jwtAccessSecret) as JwtPayload;
  } catch {
    throw new UnauthorizedError("Invalid or expired access token");
  }
}

export function verifyRefreshToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, env.jwtRefreshSecret) as JwtPayload;
  } catch {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }
}

export function rotateTokens(incomingRefreshToken: string): AuthTokenPair {
  const payload = verifyRefreshToken(incomingRefreshToken);
  const userId = refreshTokens.get(incomingRefreshToken);

  if (!userId || userId !== payload.sub) {
    throw new UnauthorizedError("Refresh token revoked");
  }

  const user = findUserById(payload.sub);
  if (!user) {
    throw new UnauthorizedError("User not found");
  }

  // Token rotation: revoke old, issue new
  refreshTokens.delete(incomingRefreshToken);
  return signTokenPair(user);
}

export function revokeRefreshToken(token: string): void {
  refreshTokens.delete(token);
}
