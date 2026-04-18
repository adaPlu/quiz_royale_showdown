import { create } from "zustand";

import { clearStoredSession, type SessionUser } from "@/lib/authSession";

export type SessionStatus = "anonymous" | "authenticating" | "authenticated";
export type SocketConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

type SessionStore = {
  hydrated: boolean;
  sessionStatus: SessionStatus;
  user: SessionUser | null;
  authError: string | null;
  connectionStatus: SocketConnectionStatus;
  connectionError: string | null;
  hydrate: (user: SessionUser | null) => void;
  startAuth: () => void;
  finishAuth: (user: SessionUser) => void;
  failAuth: (message: string) => void;
  clearSession: () => void;
  setConnectionStatus: (status: SocketConnectionStatus) => void;
  setConnectionError: (message: string | null) => void;
};

export const useSessionStore = create<SessionStore>((set) => ({
  hydrated: false,
  sessionStatus: "anonymous",
  user: null,
  authError: null,
  connectionStatus: "disconnected",
  connectionError: null,
  hydrate: (user) =>
    set({
      hydrated: true,
      sessionStatus: user ? "authenticated" : "anonymous",
      user,
      authError: null
    }),
  startAuth: () =>
    set({
      sessionStatus: "authenticating",
      authError: null
    }),
  finishAuth: (user) =>
    set({
      hydrated: true,
      sessionStatus: "authenticated",
      user,
      authError: null,
      connectionError: null
    }),
  failAuth: (message) =>
    set({
      hydrated: true,
      sessionStatus: "anonymous",
      user: null,
      authError: message
    }),
  clearSession: () => {
    clearStoredSession();
    set({
      hydrated: true,
      sessionStatus: "anonymous",
      user: null,
      authError: null,
      connectionStatus: "disconnected",
      connectionError: null
    });
  },
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setConnectionError: (message) =>
    set((state) => ({
      connectionError: message,
      connectionStatus: message ? "error" : state.connectionStatus
    }))
}));
