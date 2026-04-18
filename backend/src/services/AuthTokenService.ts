import jwt from "jsonwebtoken";

import { env } from "../config/env";
import { authStore } from "./AuthStore";

type AuthClaims = {
  sub: string;
  email: string;
  displayName: string;
};

const accessTtl = env.jwtAccessTtl as jwt.SignOptions["expiresIn"];
const refreshTtl = env.jwtRefreshTtl as jwt.SignOptions["expiresIn"];

const buildClaims = (user: { id: string; email: string; displayName: string }): AuthClaims => ({
  sub: user.id,
  email: user.email,
  displayName: user.displayName
});

export const issueAuthTokens = (user: { id: string; email: string; displayName: string }) => {
  const claims = buildClaims(user);
  const accessToken = jwt.sign(claims, env.jwtAccessSecret, { expiresIn: accessTtl });
  const refreshToken = jwt.sign(claims, env.jwtRefreshSecret, { expiresIn: refreshTtl });

  authStore.storeRefreshToken(refreshToken, user.id);

  return {
    accessToken,
    refreshToken
  };
};

export const refreshAuthTokens = (refreshToken: string) => {
  const claims = jwt.verify(refreshToken, env.jwtRefreshSecret) as AuthClaims;
  if (!authStore.hasRefreshToken(refreshToken, claims.sub)) {
    throw new Error("REFRESH_TOKEN_REVOKED");
  }

  const nextTokens = {
    accessToken: jwt.sign(claims, env.jwtAccessSecret, { expiresIn: accessTtl }),
    refreshToken: jwt.sign(claims, env.jwtRefreshSecret, { expiresIn: refreshTtl })
  };

  const rotated = authStore.rotateRefreshToken(refreshToken, nextTokens.refreshToken, claims.sub);
  if (!rotated) {
    throw new Error("REFRESH_TOKEN_REVOKED");
  }

  return nextTokens;
};

export const verifyAccessToken = (token: string): AuthClaims => {
  return jwt.verify(token, env.jwtAccessSecret) as AuthClaims;
};

export const verifyRefreshToken = (token: string): AuthClaims => {
  return jwt.verify(token, env.jwtRefreshSecret) as AuthClaims;
};
