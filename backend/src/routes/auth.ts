import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { env } from "../config/env";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { prisma } from "../models/prismaClient";
import {
  findUserById,
  issueTokenPair,
  revokeRefreshToken,
  rotateRefreshToken
} from "../services/AuthService";
import { ConflictError, ForbiddenError, UnauthorizedError } from "../utils/errors";
import { generateId } from "../utils/ulid";
import { logger } from "../utils/logger";

const BCRYPT_ROUNDS = 12;

const REFRESH_COOKIE_NAME = "qrs.rt";
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_COOKIE_SAME_SITE = env.isProduction ? "none" : "lax";
const REFRESH_TOKEN_RESPONSE_HEADER = "x-refresh-token-response";
const CSRF_PROTECTION_HEADER = "x-csrf-protection";

const registerSchema = z
  .object({
    email: z.string().email().max(254),
    username: z
      .string()
      .trim()
      .min(3)
      .max(24)
      .regex(/^\w+$/, "username must be alphanumeric")
      .optional(),
    displayName: z.string().trim().min(1).max(32).optional(),
    password: z.string().min(8).max(128)
  })
  .refine((value) => Boolean(value.displayName ?? value.username), {
    message: "displayName or username is required",
    path: ["displayName"]
  });

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128)
});

const refreshSchema = z
  .object({
    refreshToken: z.string().min(20).optional()
  })
  .default({});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many registration attempts, please try again later." },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again later." },
});

const logoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many logout attempts, please try again later." },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many refresh attempts, please try again later." },
});

const meLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests to /me, please try again later." },
});

export const authRouter = Router();

function isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function formatAuthPayload(
  user: { id: string; email: string; displayName: string },
  tokens: { accessToken: string; refreshToken: string },
  includeRefreshToken = false
) {
  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName
    },
    accessToken: tokens.accessToken,
    ...(includeRefreshToken ? { refreshToken: tokens.refreshToken } : {})
  };
}

function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: REFRESH_COOKIE_SAME_SITE,
    path: "/api/v1/auth",
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: REFRESH_COOKIE_SAME_SITE,
    path: "/api/v1/auth",
  });
}

function wantsRefreshTokenInBody(req: Request): boolean {
  return req.get(REFRESH_TOKEN_RESPONSE_HEADER)?.toLowerCase() === "body";
}

function getBodyRefreshToken(req: Request): string | null {
  const token = (req.body as { refreshToken?: string }).refreshToken;
  return typeof token === "string" && token.length > 0 ? token : null;
}

function getCookieRefreshToken(req: Request): string | null {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  return typeof token === "string" && token.length > 0 ? token : null;
}

function getRequestRefreshToken(req: Request): string | null {
  const bodyToken = getBodyRefreshToken(req);
  if (bodyToken) {
    return bodyToken;
  }

  const cookieToken = getCookieRefreshToken(req);
  if (!cookieToken) {
    return null;
  }

  if (req.get(CSRF_PROTECTION_HEADER) !== "1") {
    throw new ForbiddenError("Missing CSRF protection header");
  }

  return cookieToken;
}

authRouter.post("/register", registerLimiter, validate({ body: registerSchema }), async (req, res, next) => {
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
    res.status(201).json(formatAuthPayload(user, tokens, wantsRefreshTokenInBody(req)));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      next(new ConflictError("Email is already taken"));
      return;
    }

    next(error);
  }
});

authRouter.post("/login", loginLimiter, validate({ body: loginSchema }), async (req, res, next) => {
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
    res.json(formatAuthPayload(user, tokens, wantsRefreshTokenInBody(req)));
  } catch (error) {
    next(error);
  }
});

authRouter.post("/refresh", refreshLimiter, validate({ body: refreshSchema }), async (req, res, next) => {
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
      ...(wantsRefreshTokenInBody(req) ? { refreshToken: tokens.refreshToken } : {})
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", logoutLimiter, validate({ body: refreshSchema }), async (req, res, next) => {
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

authRouter.get("/me", meLimiter, requireAuth, async (req, res, next) => {
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
