import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
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

const BCRYPT_ROUNDS = 12;

const REFRESH_COOKIE_NAME = 'qrs.rt';
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

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

const refreshSchema = z.object({
  refreshToken: z.string().min(20).optional()
});

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
    accessToken: tokens.accessToken
  };
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

    res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, REFRESH_COOKIE_OPTS);
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

    res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, REFRESH_COOKIE_OPTS);
    res.json(formatAuthPayload(user, tokens));
  } catch (error) {
    next(error);
  }
});

authRouter.post("/refresh", validate({ body: refreshSchema }), async (req, res, next) => {
  try {
    const refreshToken =
      req.cookies?.[REFRESH_COOKIE_NAME] ??
      (req.body as z.infer<typeof refreshSchema>).refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedError('No refresh token');
    }

    const tokens = await rotateRefreshToken(refreshToken);

    logger.info("Tokens refreshed");

    res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, REFRESH_COOKIE_OPTS);
    res.json({ accessToken: tokens.accessToken });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    const refreshToken =
      req.cookies?.[REFRESH_COOKIE_NAME] ??
      (req.body as { refreshToken?: string }).refreshToken;

    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
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
