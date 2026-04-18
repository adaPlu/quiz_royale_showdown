import axios from "axios";

import {
  clearStoredSession,
  getStoredTokens,
  getStoredUser,
  updateStoredTokens,
  updateStoredUser,
  type SessionTokens
} from "@/lib/authSession";
import { readUserFromAccessToken } from "@/lib/jwt";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api/v1";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: false
});

apiClient.interceptors.request.use((config) => {
  const tokens = getStoredTokens();
  if (tokens?.accessToken) {
    config.headers.Authorization = `Bearer ${tokens.accessToken}`;
  }
  return config;
});

let refreshPromise: Promise<SessionTokens> | null = null;

export const refreshAccessToken = async (): Promise<SessionTokens> => {
  if (refreshPromise) {
    return refreshPromise;
  }

  const tokens = getStoredTokens();
  if (!tokens?.refreshToken) {
    clearStoredSession();
    throw new Error("No refresh token available");
  }

  refreshPromise = axios
    .post(`${API_BASE_URL}/auth/refresh`, {
      refreshToken: tokens.refreshToken
    })
    .then((response) => {
      const refreshedTokens = response.data.tokens as SessionTokens;
      updateStoredTokens(refreshedTokens);
      const decodedUser = readUserFromAccessToken(refreshedTokens.accessToken);
      if (decodedUser) {
        updateStoredUser(decodedUser);
      } else if (!getStoredUser()) {
        clearStoredSession();
        throw new Error("Unable to recover user from refreshed access token");
      }

      return refreshedTokens;
    })
    .catch((error) => {
      clearStoredSession();
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const requestConfig = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    if (
      error.response?.status !== 401 ||
      !requestConfig ||
      requestConfig._retry ||
      requestConfig.url?.includes("/auth/login") ||
      requestConfig.url?.includes("/auth/register") ||
      requestConfig.url?.includes("/auth/refresh")
    ) {
      throw error;
    }

    requestConfig._retry = true;

    const refreshedTokens = await refreshAccessToken();
    requestConfig.headers.Authorization = `Bearer ${refreshedTokens.accessToken}`;
    return apiClient.request(requestConfig);
  }
);
