import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { env } from "../config/env";
import { authStore } from "../services/AuthStore";

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
    const user = await authStore.createUser(
      parsed.data.email,
      parsed.data.displayName,
      parsed.data.password
    );
    return res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName
      },
      tokens: buildTokens(user)
    });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_EXISTS") {
      return res.status(409).json({ error: "Email already registered" });
    }

    return res.status(500).json({ error: "Registration failed" });
  }
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid login payload", issues: parsed.error.flatten() });
  }

  const user = await authStore.verifyUser(parsed.data.email, parsed.data.password);
  if (!user) {
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
