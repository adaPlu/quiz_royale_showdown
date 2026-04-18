/**
 * Auth routes — register, login, refresh.
 *
 * Uses Prisma for user persistence, bcrypt (12 rounds) for password hashing,
 * and the AuthService helpers for token signing / verification.
 */

import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";

import { prisma } from "../models/prismaClient";
import { validate } from "../middleware/validate";
import {
  signTokenPair,
  verifyRefreshToken,
  findUserById,
} from "../services/AuthService";
import {
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
} from "../utils/errors";
import { generateId } from "../utils/ulid";
import { logger } from "../utils/logger";

const BCRYPT_ROUNDS = 12;

// ─── Schemas ─────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(24).regex(/^\w+$/, "username must be alphanumeric"),
  displayName: z.string().min(1).max(40),
  password: z.string().min(8).max(72),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const authRouter = Router();

// POST /auth/register
authRouter.post(
  "/register",
  validate({ body: registerSchema }),
  async (req, res, next): Promise<void> => {
    try {
      const { email, username, displayName, password } = req.body as z.infer<typeof registerSchema>;
      const normalizedEmail = email.toLowerCase().trim();

      // Check for existing email or username
      const existing = await prisma.user.findFirst({
        where: {
          OR: [
            { email: normalizedEmail },
            { displayName: username },
          ],
        },
        select: { id: true, email: true, displayName: true },
      });

      if (existing) {
        const field = existing.email === normalizedEmail ? "Email" : "Username";
        throw new ConflictError(`${field} is already taken`);
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const userId = generateId();

      const user = await prisma.user.create({
        data: {
          id: userId,
          email: normalizedEmail,
          displayName: displayName ?? username,
          passwordHash,
        },
        select: { id: true, email: true, displayName: true },
      });

      const tokens = signTokenPair({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      });

      logger.info("User registered", { userId: user.id });

      res.status(201).json({
        user: { id: user.id, email: user.email, displayName: user.displayName },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /auth/login
authRouter.post(
  "/login",
  validate({ body: loginSchema }),
  async (req, res, next): Promise<void> => {
    try {
      const { email, password } = req.body as z.infer<typeof loginSchema>;
      const normalizedEmail = email.toLowerCase().trim();

      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, email: true, displayName: true, passwordHash: true },
      });

      if (!user) {
        // Constant-time comparison to prevent enumeration
        await bcrypt.compare(password, "$2b$12$invalidhashpaddinginvalidhashpaddinginvalid00");
        throw new UnauthorizedError("Invalid credentials");
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        throw new UnauthorizedError("Invalid credentials");
      }

      const tokens = signTokenPair({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      });

      logger.info("User logged in", { userId: user.id });

      res.json({
        user: { id: user.id, email: user.email, displayName: user.displayName },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /auth/refresh
authRouter.post(
  "/refresh",
  validate({ body: refreshSchema }),
  async (req, res, next): Promise<void> => {
    try {
      const { refreshToken } = req.body as z.infer<typeof refreshSchema>;

      // verifyRefreshToken throws UnauthorizedError if invalid / expired
      const payload = verifyRefreshToken(refreshToken);

      // Validate user still exists (fallback: in-memory map)
      const memUser = findUserById(payload.sub);
      let userId = payload.sub;
      let userEmail = payload.email;
      let userDisplayName = payload.displayName;

      if (!memUser) {
        // Try Prisma
        const dbUser = await prisma.user.findUnique({
          where: { id: payload.sub },
          select: { id: true, email: true, displayName: true },
        });
        if (!dbUser) {
          throw new UnauthorizedError("User not found");
        }
        userId = dbUser.id;
        userEmail = dbUser.email;
        userDisplayName = dbUser.displayName;
      }

      const tokens = signTokenPair({ id: userId, email: userEmail, displayName: userDisplayName });

      logger.info("Tokens refreshed", { userId });

      res.json({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
    } catch (err) {
      next(err);
    }
  }
);
