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
  setUser: (user: AuthUserInput) => void;
  setAccessToken: (token: string) => void;
  setTokens: (tokens: { accessToken: string }) => void;
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

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: storedAccessToken(),
      setUser: (user) => set({ user: normalizeUser(user) }),
      setAccessToken: (token) => {
        persistTokens({ accessToken: token });
        socketService.connect(token);
        set({ accessToken: token });
      },
      setTokens: (tokens) => {
        persistTokens(tokens);
        socketService.connect(tokens.accessToken);
        set({ accessToken: tokens.accessToken });
      },
      clearAuth: () => {
        clearStoredTokens();
        socketService.disconnect();
        set({ user: null, accessToken: null });
      },
    }),
    {
      name: 'qr-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
      }),
    },
  ),
);
