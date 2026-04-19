import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { clearStoredTokens, persistTokens } from '@/services/apiClient';
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
  refreshToken: string | null;
  setUser: (user: AuthUserInput) => void;
  setAccessToken: (token: string) => void;
  setTokens: (tokens: { accessToken: string; refreshToken?: string }) => void;
  clearAuth: () => void;
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

const storedAccessToken = () => localStorage.getItem('qrs.accessToken');
const storedRefreshToken = () => localStorage.getItem('qrs.refreshToken');

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: storedAccessToken(),
      refreshToken: storedRefreshToken(),
      setUser: (user) => set({ user: normalizeUser(user) }),
      setAccessToken: (token) => {
        persistTokens({ accessToken: token });
        socketService.connect(token);
        set({ accessToken: token });
      },
      setTokens: (tokens) => {
        persistTokens(tokens);
        socketService.connect(tokens.accessToken);
        set((state) => ({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? state.refreshToken,
        }));
      },
      clearAuth: () => {
        clearStoredTokens();
        socketService.disconnect();
        set({ user: null, accessToken: null, refreshToken: null });
      },
    }),
    {
      name: 'qr-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    },
  ),
);
