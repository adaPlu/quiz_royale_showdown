import { io, type Socket } from "socket.io-client";

import { getStoredTokens, subscribeToTokenChanges } from "@/lib/authSession";
import { serverEventSchema, type ClientEvent, type ServerEvent } from "@/lib/contracts";
import { refreshAccessToken } from "@/services/apiClient";
import type { SocketConnectionStatus } from "@/stores/sessionStore";

type Listener = (event: ServerEvent) => void;
type StatusListener = (status: SocketConnectionStatus) => void;
type ErrorListener = (message: string | null) => void;

class SocketService {
  private socket: Socket | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly statusListeners = new Set<StatusListener>();
  private readonly errorListeners = new Set<ErrorListener>();
  private desiredRoomCode: string | null = null;
  private heartbeatRoomId: string | null = null;
  private heartbeatTimer: number | null = null;
  private isRefreshingAuth = false;

  constructor() {
    subscribeToTokenChanges((tokens) => {
      if (!tokens?.accessToken) {
        this.stopHeartbeat();
        this.disconnect();
        return;
      }

      if (this.socket) {
        this.socket.auth = { token: tokens.accessToken };
      }
    });
  }

  connect(): void {
    const tokens = getStoredTokens();
    if (!tokens?.accessToken) {
      this.emitError("Sign in before opening the live room connection.");
      return;
    }

    if (this.socket?.connected || this.socket?.active) {
      if (this.socket) {
        this.socket.auth = { token: tokens.accessToken };
      }
      return;
    }

    if (!this.socket) {
      this.socket = io(import.meta.env.VITE_WS_BASE_URL ?? "http://localhost:4000", {
        autoConnect: false,
        path: "/ws",
        transports: ["websocket"],
        reconnection: true,
        auth: {
          token: tokens.accessToken
        }
      });

      this.registerCoreListeners();
    }

    this.socket.auth = {
      token: tokens.accessToken
    };
    this.emitStatus(this.socket.active ? "reconnecting" : "connecting");
    this.socket.connect();
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.socket?.disconnect();
    this.socket = null;
    this.emitStatus("disconnected");
  }

  send(event: ClientEvent): void {
    this.socket?.emit("message", event);
  }

  joinRoom(roomCode: string): void {
    this.desiredRoomCode = roomCode.trim().toUpperCase();
    this.connect();
    if (this.socket?.connected && this.desiredRoomCode) {
      this.send({
        type: "room:join",
        version: "v1",
        payload: {
          roomCode: this.desiredRoomCode
        }
      });
    }
  }

  setHeartbeatRoom(roomId: string | null): void {
    this.heartbeatRoomId = roomId;
    this.restartHeartbeat();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeConnection(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  subscribeErrors(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  private registerCoreListeners(): void {
    if (!this.socket) {
      return;
    }

    this.socket.on("connect", () => {
      this.emitError(null);
      this.emitStatus("connected");
      if (this.desiredRoomCode) {
        this.send({
          type: "room:join",
          version: "v1",
          payload: {
            roomCode: this.desiredRoomCode
          }
        });
      }
      this.restartHeartbeat();
    });

    this.socket.on("disconnect", (reason) => {
      this.stopHeartbeat();
      this.emitStatus(reason === "io client disconnect" ? "disconnected" : "reconnecting");
    });

    this.socket.on("connect_error", async (error: Error) => {
      const message = error.message || "Socket connection failed";
      const looksUnauthorized = /unauthorized|auth token/i.test(message);

      if (looksUnauthorized && !this.isRefreshingAuth) {
        this.isRefreshingAuth = true;
        this.emitStatus("reconnecting");

        try {
          const refreshedTokens = await refreshAccessToken();
          if (this.socket) {
            this.socket.auth = { token: refreshedTokens.accessToken };
            this.socket.connect();
          }
          this.emitError(null);
        } catch {
          this.emitError("Session expired. Sign in again to rejoin the room.");
          this.disconnect();
        } finally {
          this.isRefreshingAuth = false;
        }

        return;
      }

      this.emitError(message);
      this.emitStatus("error");
    });

    this.socket.on("message", (payload: unknown) => {
      const parsed = serverEventSchema.safeParse(payload);
      if (parsed.success) {
        this.listeners.forEach((listener) => listener(parsed.data));
      }
    });
  }

  private restartHeartbeat(): void {
    this.stopHeartbeat();
    if (!this.socket?.connected || !this.heartbeatRoomId) {
      return;
    }

    this.heartbeatTimer = window.setInterval(() => {
      if (!this.socket?.connected || !this.heartbeatRoomId) {
        return;
      }

      this.send({
        type: "client:heartbeat",
        version: "v1",
        payload: {
          roomId: this.heartbeatRoomId,
          sentAt: new Date().toISOString()
        }
      });
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private emitStatus(status: SocketConnectionStatus): void {
    this.statusListeners.forEach((listener) => listener(status));
  }

  private emitError(message: string | null): void {
    this.errorListeners.forEach((listener) => listener(message));
  }
}

export const socketService = new SocketService();
