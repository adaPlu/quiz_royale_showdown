import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { apiClient } from '@/services/apiClient';
import { setAccessToken as setApiAccessToken } from '@/services/apiClient';
import { socketService } from '@/services/socketService';

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  username: string;
  level: number;
  xp: number;
  coins: number;
  avatarUrl?: string;
};

type AuthUserInput = Partial<AuthUser> & {
  id: string;
  email: string;
  displayName?: string;
  username?: string;
};

type AuthState = {
  user: AuthUser | null;
  accessToken: string | null;
  setUser: (user: AuthUserInput) => void;
  setAccessToken: (token: string) => void;
  setTokens: (tokens: { accessToken: string }) => void;
  clearAuth: () => void;
  initAuth: () => Promise<void>;
};

const normalizeUser = (user: AuthUserInput): AuthUser => {
  const displayName = user.displayName ?? user.username ?? user.email;
  return {
    id: user.id,
    email: user.email,
    displayName,
    username: user.username ?? displayName,
    level: user.level ?? 1,
    xp: user.xp ?? 0,
    coins: user.coins ?? 0,
    avatarUrl: user.avatarUrl,
  };
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      setUser: (user) => set({ user: normalizeUser(user) }),
      setAccessToken: (token) => {
        setApiAccessToken(token);
        socketService.connect(token);
        set({ accessToken: token });
      },
      setTokens: (tokens) => {
        setApiAccessToken(tokens.accessToken);
        socketService.connect(tokens.accessToken);
        set({ accessToken: tokens.accessToken });
      },
      clearAuth: () => {
        setApiAccessToken(null);
        socketService.disconnect();
        set({ user: null, accessToken: null });
      },
      initAuth: async () => {
        try {
          const response = await apiClient.post<{ accessToken: string }>(
            '/auth/refresh',
            {},
            { withCredentials: true },
          );
          setApiAccessToken(response.data.accessToken);
          socketService.connect(response.data.accessToken);
          set({ accessToken: response.data.accessToken });
        } catch {
          // refresh failed — user must log in
        }
      },
    }),
    {
      name: 'qr-auth',
      partialize: (state) => ({
        user: state.user,
      }),
    },
  ),
);
