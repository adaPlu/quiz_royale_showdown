import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { refreshAuthSession } from '@/services/apiClient';

export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  level: number;
  xp: number;
  coins: number;
  avatarUrl?: string;
}

type AuthApiUser = {
  id?: string | null;
  username?: string | null;
  displayName?: string | null;
  email?: string | null;
  level?: number | null;
  xp?: number | null;
  coins?: number | null;
  avatarUrl?: string | null;
};

export interface AuthResponse {
  user: AuthApiUser;
  accessToken: string;
  refreshToken: string;
}

type TokenUpdate = {
  accessToken: string;
  refreshToken?: string | null;
};

type AccessTokenClaims = {
  sub?: string;
  email?: string;
  displayName?: string;
};

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  hasHydrated: boolean;
  authResolved: boolean;
  isBootstrapping: boolean;
  setSession: (session: AuthResponse) => void;
  setUser: (user: User) => void;
  setAccessToken: (token: string) => void;
  setTokens: (tokens: TokenUpdate) => void;
  setHasHydrated: (hydrated: boolean) => void;
  bootstrapSession: () => Promise<void>;
  clearAuth: () => void;
}

let bootstrapPromise: Promise<void> | null = null;

function decodeAccessToken(accessToken: string): AccessTokenClaims | null {
  try {
    const [, payload] = accessToken.split('.');
    if (!payload) return null;

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = atob(padded);

    return JSON.parse(decoded) as AccessTokenClaims;
  } catch {
    return null;
  }
}

function normalizeAuthUser(user: AuthApiUser, fallback?: User | null): User | null {
  const id = user.id ?? fallback?.id ?? null;
  const email = user.email ?? fallback?.email ?? null;
  const displayName =
    user.displayName?.trim() ||
    user.username?.trim() ||
    fallback?.displayName ||
    fallback?.username ||
    (email ? email.split('@')[0] : null);

  if (!id || !email || !displayName) {
    return null;
  }

  return {
    id,
    username: displayName,
    displayName,
    email,
    level: user.level ?? fallback?.level ?? 1,
    xp: user.xp ?? fallback?.xp ?? 0,
    coins: user.coins ?? fallback?.coins ?? 0,
    avatarUrl: user.avatarUrl ?? fallback?.avatarUrl ?? undefined,
  };
}

function restoreUserFromAccessToken(accessToken: string, fallback?: User | null): User | null {
  const claims = decodeAccessToken(accessToken);

  if (!claims?.sub || !claims.email) {
    return normalizeAuthUser({}, fallback);
  }

  return normalizeAuthUser(
    {
      id: claims.sub,
      email: claims.email,
      displayName: claims.displayName,
    },
    fallback,
  );
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      hasHydrated: false,
      authResolved: false,
      isBootstrapping: false,

      setSession: (session) =>
        set((state) => ({
          user: normalizeAuthUser(session.user, state.user),
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          authResolved: true,
          isBootstrapping: false,
        })),

      setUser: (user) => set({ user }),

      setAccessToken: (token) =>
        set({
          accessToken: token,
          authResolved: true,
        }),

      setTokens: ({ accessToken, refreshToken }) =>
        set((state) => ({
          accessToken,
          refreshToken: refreshToken ?? state.refreshToken,
          authResolved: true,
          isBootstrapping: false,
        })),

      setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),

      bootstrapSession: async () => {
        if (bootstrapPromise) {
          return bootstrapPromise;
        }

        const { accessToken, refreshToken, user } = get();

        if (accessToken && user) {
          set({ authResolved: true, isBootstrapping: false });
          return;
        }

        if (!refreshToken) {
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            authResolved: true,
            isBootstrapping: false,
          });
          return;
        }

        set({ isBootstrapping: true, authResolved: false });

        bootstrapPromise = refreshAuthSession()
          .then(({ accessToken: nextAccessToken, refreshToken: nextRefreshToken }) => {
            const restoredUser = restoreUserFromAccessToken(nextAccessToken, get().user);

            if (!restoredUser) {
              throw new Error('Unable to restore session');
            }

            set({
              user: restoredUser,
              accessToken: nextAccessToken,
              refreshToken: nextRefreshToken,
              authResolved: true,
              isBootstrapping: false,
            });
          })
          .catch(() => {
            set({
              user: null,
              accessToken: null,
              refreshToken: null,
              authResolved: true,
              isBootstrapping: false,
            });
          })
          .finally(() => {
            bootstrapPromise = null;
          });

        return bootstrapPromise;
      },

      clearAuth: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          authResolved: true,
          isBootstrapping: false,
        }),
    }),
    {
      name: 'qr-auth',
      partialize: (state) => ({
        user: state.user,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          state?.clearAuth();
        }

        state?.setHasHydrated(true);
      },
    },
  ),
);
