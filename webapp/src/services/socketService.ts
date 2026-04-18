import { io, type Socket } from "socket.io-client";

import { serverEventSchema, type ClientEvent, type ServerEvent } from "@/lib/contracts";

type Listener = (event: ServerEvent) => void;

class SocketService {
  private socket: Socket | null = null;
  private readonly listeners = new Set<Listener>();

  connect(accessToken: string): void {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io(import.meta.env.VITE_WS_BASE_URL ?? "http://localhost:4000", {
      path: "/ws",
      transports: ["websocket"],
      auth: {
        token: accessToken
      }
    });

    this.socket.on("message", (payload: unknown) => {
      const parsed = serverEventSchema.safeParse(payload);
      if (parsed.success) {
        this.listeners.forEach((listener) => listener(parsed.data));
      }
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  send(event: ClientEvent): void {
    this.socket?.emit("message", event);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const socketService = new SocketService();
