import { createHash } from "crypto";

import jwt from "jsonwebtoken";
import { ulid } from "ulid";

import { env } from "../config/env";
import { prisma } from "../models/prismaClient";
import { UnauthorizedError } from "../utils/errors";

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
  jti?: string;
  iat?: number;
  exp?: number;
};

function buildJwtPayload(user: AuthUser): Omit<JwtPayload, "iat" | "exp"> {
  return {
    sub: user.id,
    email: user.email,
    displayName: user.displayName
  };
}

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getRefreshTokenExpiry(token: string): Date {
  const payload = verifyRefreshToken(token);

  if (typeof payload.exp !== "number") {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  return new Date(payload.exp * 1000);
}

function signAccessToken(user: AuthUser): string {
  return jwt.sign(buildJwtPayload(user), env.jwtAccessSecret, {
    expiresIn: env.jwtAccessTtl as jwt.SignOptions["expiresIn"]
  });
}

function signRefreshToken(user: AuthUser): string {
  return jwt.sign({ ...buildJwtPayload(user), jti: ulid() }, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshTtl as jwt.SignOptions["expiresIn"]
  });
}

async function persistRefreshToken(userId: string, refreshToken: string): Promise<void> {
  await prisma.refreshToken.create({
    data: {
      id: ulid(),
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: getRefreshTokenExpiry(refreshToken)
    }
  });
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, displayName: true }
  });

  return user;
}

export async function issueTokenPair(user: AuthUser): Promise<AuthTokenPair> {
  const tokens = signTokenPair(user);

  await persistRefreshToken(user.id, tokens.refreshToken);

  return tokens;
}

export function signTokenPair(user: AuthUser): AuthTokenPair {
  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user)
  };
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, env.jwtAccessSecret) as JwtPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError("Access token expired");
    }

    throw new UnauthorizedError("Invalid access token");
  }
}

export function verifyRefreshToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, env.jwtRefreshSecret) as JwtPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError("Refresh token expired");
    }

    throw new UnauthorizedError("Invalid refresh token");
  }
}

export async function rotateRefreshToken(incomingRefreshToken: string): Promise<AuthTokenPair> {
  const payload = verifyRefreshToken(incomingRefreshToken);
  const existingToken = await prisma.refreshToken.findFirst({
    where: {
      tokenHash: hashRefreshToken(incomingRefreshToken),
      expiresAt: {
        gt: new Date()
      }
    },
    select: {
      id: true,
      userId: true
    }
  });

  if (!existingToken || existingToken.userId !== payload.sub) {
    throw new UnauthorizedError("Refresh token revoked");
  }

  const user = await findUserById(payload.sub);
  if (!user) {
    await prisma.refreshToken.deleteMany({
      where: { id: existingToken.id }
    });
    throw new UnauthorizedError("User not found");
  }

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  await prisma.$transaction([
    prisma.refreshToken.deleteMany({
      where: { id: existingToken.id }
    }),
    prisma.refreshToken.create({
      data: {
        id: ulid(),
        userId: user.id,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: getRefreshTokenExpiry(refreshToken)
      }
    })
  ]);

  return { accessToken, refreshToken };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.deleteMany({
    where: {
      tokenHash: hashRefreshToken(token)
    }
  });
}
