import { Router } from "express";
import { z } from "zod";

import { requireHttpAuth, type AuthenticatedRequest } from "../middleware/httpAuth";
import { env } from "../config/env";
import { authStore } from "../services/AuthStore";
import { issueAuthTokens, refreshAuthTokens, verifyRefreshToken } from "../services/AuthTokenService";

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
      tokens: issueAuthTokens(user)
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
    tokens: issueAuthTokens(user)
  });
});

authRouter.post("/refresh", (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid refresh payload", issues: parsed.error.flatten() });
  }

  try {
    return res.json({
      tokens: refreshAuthTokens(parsed.data.refreshToken)
    });
  } catch (error) {
    if (error instanceof Error && error.message === "REFRESH_TOKEN_REVOKED") {
      return res.status(401).json({ error: "Refresh token revoked" });
    }

    return res.status(401).json({ error: "Refresh token expired or invalid" });
  }
});

authRouter.post("/logout", (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid logout payload", issues: parsed.error.flatten() });
  }

  try {
    verifyRefreshToken(parsed.data.refreshToken);
    authStore.revokeRefreshToken(parsed.data.refreshToken);
    return res.status(204).send();
  } catch {
    authStore.revokeRefreshToken(parsed.data.refreshToken);
    return res.status(204).send();
  }
});

authRouter.get("/me", requireHttpAuth, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  return res.json({
    user: authReq.authUser
  });
});
