import { z } from "zod";

import {
  clearStoredSession,
  getStoredSession,
  storeSession,
  type SessionUser,
  type StoredSession
} from "@/lib/authSession";
import { readUserFromAccessToken } from "@/lib/jwt";
import { apiClient } from "@/services/apiClient";

const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string().min(1)
});

const tokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1)
});

const authResponseSchema = z.object({
  user: sessionUserSchema,
  tokens: tokensSchema
});

const authPayloadSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72)
});

const registerPayloadSchema = authPayloadSchema.extend({
  displayName: z.string().min(3).max(24)
});

type AuthPayload = z.infer<typeof authPayloadSchema>;
type RegisterPayload = z.infer<typeof registerPayloadSchema>;

const coerceSession = (session: StoredSession): StoredSession => {
  const decodedUser = readUserFromAccessToken(session.tokens.accessToken);
  return {
    user: decodedUser ?? session.user,
    tokens: session.tokens
  };
};

export const hydrateStoredSession = (): StoredSession | null => {
  const storedSession = getStoredSession();
  if (!storedSession) {
    return null;
  }

  const normalizedSession = coerceSession(storedSession);
  storeSession(normalizedSession);
  return normalizedSession;
};

export const login = async (payload: AuthPayload): Promise<StoredSession> => {
  const parsedPayload = authPayloadSchema.parse(payload);
  const response = await apiClient.post("/auth/login", parsedPayload);
  const session = authResponseSchema.parse(response.data);
  storeSession(session);
  return session;
};

export const register = async (payload: RegisterPayload): Promise<StoredSession> => {
  const parsedPayload = registerPayloadSchema.parse(payload);
  const response = await apiClient.post("/auth/register", parsedPayload);
  const session = authResponseSchema.parse(response.data);
  storeSession(session);
  return session;
};

export const logout = async (): Promise<void> => {
  const storedSession = getStoredSession();
  clearStoredSession();

  if (!storedSession) {
    return;
  }

  try {
    await apiClient.post("/auth/logout", {
      refreshToken: storedSession.tokens.refreshToken
    });
  } catch {
    // The backend stub does not implement logout yet.
  }
};

export const restoreUserFromToken = (): SessionUser | null => {
  const storedSession = getStoredSession();
  if (!storedSession) {
    return null;
  }

  return readUserFromAccessToken(storedSession.tokens.accessToken) ?? storedSession.user;
};
