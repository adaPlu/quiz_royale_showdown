import { io, type Socket } from "socket.io-client";

import {
  type ClientEvent,
  type ClientEventPayload,
  type ClientEventType,
  type PowerupActivatePayload,
  type ServerEvent,
  serverEventSchema,
  type ServerEventPayload,
  type ServerEventType
} from "@/lib/contracts";

type Unsubscribe = () => void;

type RoomSession = {
  roomCode: string;
  roomId?: string;
  token?: string | null;
};

const ROOM_SESSION_STORAGE_KEY = "quiz-room-session";

const isBrowser = typeof window !== "undefined";

const normalizeRoomCode = (roomCode: string) => roomCode.trim().toUpperCase();

const normalizePowerupPayload = (payload: PowerupActivatePayload) => ({
  roomId: payload.roomId,
  powerUpId: "powerUpId" in payload ? payload.powerUpId : payload.powerupId,
  targetPlayerId: payload.targetPlayerId
});

const normalizeClientEvent = <TType extends ClientEventType>(
  type: TType,
  payload: ClientEventPayload<TType>
): ClientEvent => {
  if (type === "room:join") {
    const joinPayload = payload as ClientEventPayload<"room:join">;
    return {
      type,
      version: "v1",
      payload: { roomCode: normalizeRoomCode(joinPayload.roomCode) }
    } as ClientEvent;
  }

  if (type === "powerup:activate") {
    return {
      type,
      version: "v1",
      payload: normalizePowerupPayload(payload as PowerupActivatePayload)
    } as ClientEvent;
  }

  return {
    type,
    version: "v1",
    payload
  } as ClientEvent;
};

class SocketService {
  private socket: Socket | null = null;
  private token: string | null = null;
  private activeRoom: RoomSession | null = this.readStoredRoomSession();
  private listeners = new Map<ServerEventType, Set<(payload: unknown) => void>>();

  private connectionListeners = new Set<(connected: boolean) => void>();

  onConnectionChange(handler: (connected: boolean) => void): () => void {
    this.connectionListeners.add(handler);
    return () => this.connectionListeners.delete(handler);
  }

  private notifyConnectionChange(connected: boolean): void {
    this.connectionListeners.forEach((h) => h(connected));
  }

  connect(token: string): void {
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      return;
    }

    if (this.socket && this.token === trimmedToken) {
      if (!this.socket.connected) {
        this.socket.connect();
      }
      return;
    }

    this.disconnect(false);
    this.token = trimmedToken;

    const wsBaseUrl =
      (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_WS_BASE_URL ??
      "http://localhost:4000";

    this.socket = io(wsBaseUrl, {
      path: "/ws",
      transports: ["websocket"],
      auth: { token: trimmedToken },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    this.socket.on("message", (raw: unknown) => {
      const parsed = serverEventSchema.safeParse(raw);
      if (!parsed.success) {
        return;
      }

      this.handleServerEvent(parsed.data);
    });

    this.socket.on("connect", () => {
      this.notifyConnectionChange(true);
      if (this.activeRoom?.roomCode) {
        this.emit("room:join", { roomCode: this.activeRoom.roomCode });
      }
    });

    this.socket.on("disconnect", () => {
      this.notifyConnectionChange(false);
    });

    this.socket.on("connect_error", () => {
      this.notifyConnectionChange(false);
    });
  }

  disconnect(clearSession = false): void {
    this.socket?.disconnect();
    this.socket = null;
    this.token = clearSession ? null : this.token;

    if (clearSession) {
      this.activeRoom = null;
      this.clearStoredRoomSession();
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  setActiveRoom(room: RoomSession): void {
    this.activeRoom = {
      roomCode: normalizeRoomCode(room.roomCode),
      roomId: room.roomId,
      token: room.token ?? this.activeRoom?.token ?? this.token
    };
    this.storeRoomSession(this.activeRoom);
  }

  updateRoomSnapshot(roomId: string, roomCode: string): void {
    this.setActiveRoom({
      roomId,
      roomCode,
      token: this.activeRoom?.token ?? this.token
    });
  }

  getActiveRoom(): RoomSession | null {
    return this.activeRoom;
  }

  clearActiveRoom(): void {
    this.activeRoom = null;
    this.clearStoredRoomSession();
  }

  joinRoom(roomCode: string, roomId?: string): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);

    this.setActiveRoom({
      roomCode: normalizedRoomCode,
      roomId: roomId ?? this.activeRoom?.roomId,
      token: this.activeRoom?.token ?? this.token
    });

    if (this.socket?.connected) {
      this.emit("room:join", { roomCode: normalizedRoomCode });
    }
  }

  emit<TType extends ClientEventType>(type: TType, payload: ClientEventPayload<TType>): void {
    const envelope = normalizeClientEvent(type, payload);
    this.socket?.emit("message", envelope);
  }

  on<TType extends ServerEventType>(
    eventType: TType,
    handler: (payload: ServerEventPayload<TType>) => void
  ): Unsubscribe {
    const handlers = this.listeners.get(eventType) ?? new Set<(payload: unknown) => void>();
    handlers.add(handler as (payload: unknown) => void);
    this.listeners.set(eventType, handlers);

    return () => {
      const currentHandlers = this.listeners.get(eventType);
      currentHandlers?.delete(handler as (payload: unknown) => void);
      if (currentHandlers && currentHandlers.size === 0) {
        this.listeners.delete(eventType);
      }
    };
  }

  send(envelope: ClientEvent): void {
    this.socket?.emit("message", normalizeClientEvent(envelope.type, envelope.payload as never));
  }

  subscribe(handler: (event: ServerEvent) => void): Unsubscribe {
    const unsubs = ([
      "room:state_sync",
      "room:player_joined",
      "room:player_left",
      "round:countdown_started",
      "round:question_started",
      "round:answer_locked",
      "round:result",
      "round:elimination",
      "round:finale_started",
      "game:over"
    ] as const).map((eventType) =>
      this.on(eventType, (payload) => {
        handler({ type: eventType, version: "v1", payload } as ServerEvent);
      })
    );

    return () => {
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }

  private handleServerEvent(event: ServerEvent): void {
    if (event.type === "room:state_sync") {
      this.updateRoomSnapshot(event.payload.room.roomId, event.payload.room.code);
    }

    const handlers = this.listeners.get(event.type);
    handlers?.forEach((handler) => {
      handler(event.payload);
    });
  }

  private readStoredRoomSession(): RoomSession | null {
    if (!isBrowser) {
      return null;
    }

    const raw = window.sessionStorage.getItem(ROOM_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as RoomSession;
      if (!parsed.roomCode) {
        return null;
      }

      return {
        roomCode: normalizeRoomCode(parsed.roomCode),
        roomId: parsed.roomId,
        token: parsed.token ?? null
      };
    } catch {
      return null;
    }
  }

  private storeRoomSession(room: RoomSession): void {
    if (!isBrowser) {
      return;
    }

    window.sessionStorage.setItem(ROOM_SESSION_STORAGE_KEY, JSON.stringify(room));
  }

  private clearStoredRoomSession(): void {
    if (!isBrowser) {
      return;
    }

    window.sessionStorage.removeItem(ROOM_SESSION_STORAGE_KEY);
  }
}

export const socketService = new SocketService();
