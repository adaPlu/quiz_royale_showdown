import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { env } from "../config/env";
import { prisma } from "../models/prismaClient";
import { generateId } from "../utils/ulid";

const registerSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(3).max(24),
  password: z.string().min(8).max(72)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20)
});

const buildTokens = (user: { id: string; email: string; displayName: string }) => {
  const claims = {
    sub: user.id,
    email: user.email,
    displayName: user.displayName
  };
  const accessTtl = env.jwtAccessTtl as jwt.SignOptions["expiresIn"];
  const refreshTtl = env.jwtRefreshTtl as jwt.SignOptions["expiresIn"];

  return {
    accessToken: jwt.sign(claims, env.jwtAccessSecret, { expiresIn: accessTtl }),
    refreshToken: jwt.sign(claims, env.jwtRefreshSecret, { expiresIn: refreshTtl })
  };
};

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid registration payload", issues: parsed.error.flatten() });
  }

  try {
    const normalizedEmail = parsed.data.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const user = await prisma.user.create({
      data: {
        id: generateId(),
        email: normalizedEmail,
        displayName: parsed.data.displayName,
        passwordHash: await bcrypt.hash(parsed.data.password, 10),
      },
      select: { id: true, email: true, displayName: true },
    });

    return res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName
      },
      tokens: buildTokens(user)
    });
  } catch (error) {
    return res.status(500).json({ error: "Registration failed" });
  }
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid login payload", issues: parsed.error.flatten() });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase().trim() },
    select: { id: true, email: true, displayName: true, passwordHash: true },
  });
  if (!user) {
    await bcrypt.compare(parsed.data.password, "$2b$10$invalidhashpadding00000000000000000000000000000");
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const matches = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!matches) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  return res.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName
    },
    tokens: buildTokens(user)
  });
});

authRouter.post("/refresh", (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid refresh payload", issues: parsed.error.flatten() });
  }

  try {
    const claims = jwt.verify(parsed.data.refreshToken, env.jwtRefreshSecret) as {
      sub: string;
      email: string;
      displayName: string;
    };

    return res.json({
      tokens: buildTokens({
        id: claims.sub,
        email: claims.email,
        displayName: claims.displayName
      })
    });
  } catch {
    return res.status(401).json({ error: "Refresh token expired or invalid" });
  }
});
