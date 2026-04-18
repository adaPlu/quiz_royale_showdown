import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id:       string;
  username: string;
  email:    string;
  level:    number;
  xp:       number;
  coins:    number;
  avatarUrl?: string;
}

interface AuthState {
  user:        User | null;
  accessToken: string | null;
  setUser:         (user: User) => void;
  setAccessToken:  (token: string) => void;
  clearAuth:       () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user:        null,
      accessToken: null,
      setUser:        (user) => set({ user }),
      setAccessToken: (token) => set({ accessToken: token }),
      clearAuth:      () => set({ user: null, accessToken: null }),
    }),
    {
      name: 'qr-auth',
      partialize: (s) => ({ user: s.user }), // DO NOT persist accessToken to localStorage
    },
  ),
);
