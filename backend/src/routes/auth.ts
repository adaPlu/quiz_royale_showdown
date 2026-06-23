import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { prisma } from "../models/prismaClient";
import {
  findUserById,
  issueTokenPair,
  revokeRefreshToken,
  rotateRefreshToken
} from "../services/AuthService";
import { ConflictError, UnauthorizedError } from "../utils/errors";
import { generateId } from "../utils/ulid";
import { logger } from "../utils/logger";
import { env } from "../config/env";

const BCRYPT_ROUNDS = 12;

const registerSchema = z
  .object({
    email: z.string().email(),
    username: z
      .string()
      .trim()
      .min(3)
      .max(24)
      .regex(/^\w+$/, "username must be alphanumeric")
      .optional(),
    displayName: z.string().trim().min(1).max(40).optional(),
    password: z.string().min(8).max(72)
  })
  .refine((value) => Boolean(value.displayName ?? value.username), {
    message: "displayName or username is required",
    path: ["displayName"]
  });

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const optionalRefreshSchema = z
  .object({
    refreshToken: z.string().min(20).optional()
  })
  .default({});

const REFRESH_COOKIE_NAME = "quiz_refresh";
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const refreshCookieSameSite = env.isProduction ? "none" : "lax";

export const authRouter = Router();

function isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function formatAuthPayload(
  user: { id: string; email: string; displayName: string },
  tokens: { accessToken: string; refreshToken: string }
) {
  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName
    },
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken
  };
}

function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: refreshCookieSameSite,
    path: "/api/v1/auth",
    maxAge: REFRESH_COOKIE_MAX_AGE_MS
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: refreshCookieSameSite,
    path: "/api/v1/auth"
  });
}

function getCookieValue(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  for (const cookie of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = cookie.trim().split("=");
    if (rawName !== name) continue;

    const rawValue = rawValueParts.join("=");
    if (!rawValue) return null;

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

function getRequestRefreshToken(req: Request): string | null {
  return getCookieValue(req, REFRESH_COOKIE_NAME) ?? (req.body as { refreshToken?: string }).refreshToken ?? null;
}

authRouter.post("/register", validate({ body: registerSchema }), async (req, res, next) => {
  try {
    const { email, username, displayName, password } = req.body as z.infer<typeof registerSchema>;
    const normalizedEmail = email.toLowerCase().trim();
    const resolvedDisplayName = displayName?.trim() || username?.trim();

    if (!resolvedDisplayName) {
      throw new ConflictError("displayName or username is required");
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true }
    });

    if (existingUser) {
      throw new ConflictError("Email is already taken");
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        id: generateId(),
        email: normalizedEmail,
        displayName: resolvedDisplayName,
        passwordHash
      },
      select: {
        id: true,
        email: true,
        displayName: true
      }
    });

    const tokens = await issueTokenPair(user);

    logger.info("User registered", { userId: user.id });

    setRefreshCookie(res, tokens.refreshToken);
    res.status(201).json(formatAuthPayload(user, tokens));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      next(new ConflictError("Email is already taken"));
      return;
    }

    next(error);
  }
});

authRouter.post("/login", validate({ body: loginSchema }), async (req, res, next) => {
  try {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        displayName: true,
        passwordHash: true
      }
    });

    if (!user) {
      await bcrypt.hash(password, BCRYPT_ROUNDS);
      throw new UnauthorizedError("Invalid credentials");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError("Invalid credentials");
    }

    const tokens = await issueTokenPair({
      id: user.id,
      email: user.email,
      displayName: user.displayName
    });

    logger.info("User logged in", { userId: user.id });

    setRefreshCookie(res, tokens.refreshToken);
    res.json(formatAuthPayload(user, tokens));
  } catch (error) {
    next(error);
  }
});

authRouter.post("/refresh", validate({ body: optionalRefreshSchema }), async (req, res, next) => {
  try {
    const refreshToken = getRequestRefreshToken(req);
    if (!refreshToken) {
      throw new UnauthorizedError("Missing refresh token");
    }

    const tokens = await rotateRefreshToken(refreshToken);

    logger.info("Tokens refreshed");

    setRefreshCookie(res, tokens.refreshToken);
    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", validate({ body: optionalRefreshSchema }), async (req, res, next) => {
  try {
    const refreshToken = getRequestRefreshToken(req);

    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    clearRefreshCookie(res);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const userId = req.jwtClaims?.sub;

    if (!userId) {
      throw new UnauthorizedError("Missing authenticated user");
    }

    const user = await findUserById(userId);
    if (!user) {
      throw new UnauthorizedError("User not found");
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
});
