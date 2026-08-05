from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    if old not in content:
        raise RuntimeError(f"Expected text not found in {path}: {old[:120]!r}")
    write(path, content.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    content = read(path)
    updated, count = re.subn(pattern, replacement, content, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"Expected one regex match in {path}, found {count}: {pattern}")
    write(path, updated)


# ---------------------------------------------------------------------------
# WebSocket security and production configuration
# ---------------------------------------------------------------------------
write(
    "webapp/src/services/socketService.ts",
    '''import { io, type Socket } from "socket.io-client";

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
};

const ROOM_SESSION_STORAGE_KEY = "quiz-room-session";
const isBrowser = typeof window !== "undefined";
const viteEnv = (import.meta as unknown as {
  env?: Record<string, string | boolean | undefined>;
}).env;

const normalizeRoomCode = (roomCode: string) => roomCode.trim().toUpperCase();

function resolveWebSocketBaseUrl(): string {
  const configuredWs =
    typeof viteEnv?.VITE_WS_BASE_URL === "string" ? viteEnv.VITE_WS_BASE_URL.trim() : "";
  if (configuredWs) {
    return configuredWs;
  }

  const configuredApi =
    typeof viteEnv?.VITE_API_BASE_URL === "string" ? viteEnv.VITE_API_BASE_URL.trim() : "";
  if (configuredApi) {
    return configuredApi.replace(/\/api\/v1\/?$/, "");
  }

  if (viteEnv?.DEV === true) {
    return "http://localhost:4000";
  }

  throw new Error("VITE_WS_BASE_URL or VITE_API_BASE_URL is required in production.");
}

const normalizePowerupPayload = (payload: PowerupActivatePayload) => ({
  roomId: payload.roomId,
  powerUpId: payload.powerUpId,
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
    this.connectionListeners.forEach((handler) => handler(connected));
  }

  connect(token: string): void {
    const trimmedToken = token.trim();
    if (!trimmedToken) return;

    if (this.socket && this.token === trimmedToken) {
      if (!this.socket.connected) this.socket.connect();
      return;
    }

    this.disconnect(false);
    this.token = trimmedToken;

    this.socket = io(resolveWebSocketBaseUrl(), {
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
      if (parsed.success) this.handleServerEvent(parsed.data);
    });

    this.socket.on("connect", () => {
      this.notifyConnectionChange(true);
      if (this.activeRoom?.roomCode) {
        this.emit("room:join", { roomCode: this.activeRoom.roomCode });
      }
    });
    this.socket.on("disconnect", () => this.notifyConnectionChange(false));
    this.socket.on("connect_error", () => this.notifyConnectionChange(false));
  }

  disconnect(clearSession = false): void {
    this.socket?.disconnect();
    this.socket = null;
    if (clearSession) {
      this.token = null;
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
      roomId: room.roomId
    };
    this.storeRoomSession(this.activeRoom);
  }

  updateRoomSnapshot(roomId: string, roomCode: string): void {
    this.setActiveRoom({ roomId, roomCode });
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
      roomId: roomId ?? this.activeRoom?.roomId
    });

    if (this.socket?.connected) {
      this.emit("room:join", { roomCode: normalizedRoomCode });
    }
  }

  emit<TType extends ClientEventType>(type: TType, payload: ClientEventPayload<TType>): void {
    this.socket?.emit("message", normalizeClientEvent(type, payload));
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
      if (currentHandlers?.size === 0) this.listeners.delete(eventType);
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
      "game:over",
      "powerup:activated",
      "powerup:private_effect",
      "error"
    ] as const).map((eventType) =>
      this.on(eventType, (payload) => {
        handler({ type: eventType, version: "v1", payload } as ServerEvent);
      })
    );
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }

  private handleServerEvent(event: ServerEvent): void {
    if (event.type === "room:state_sync") {
      this.updateRoomSnapshot(event.payload.room.roomId, event.payload.room.code);
    }
    this.listeners.get(event.type)?.forEach((handler) => handler(event.payload));
  }

  private readStoredRoomSession(): RoomSession | null {
    if (!isBrowser) return null;
    const raw = window.sessionStorage.getItem(ROOM_SESSION_STORAGE_KEY);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as RoomSession;
      if (!parsed.roomCode) return null;
      return {
        roomCode: normalizeRoomCode(parsed.roomCode),
        roomId: parsed.roomId
      };
    } catch {
      return null;
    }
  }

  private storeRoomSession(room: RoomSession): void {
    if (!isBrowser) return;
    window.sessionStorage.setItem(
      ROOM_SESSION_STORAGE_KEY,
      JSON.stringify({ roomCode: room.roomCode, roomId: room.roomId })
    );
  }

  private clearStoredRoomSession(): void {
    if (isBrowser) window.sessionStorage.removeItem(ROOM_SESSION_STORAGE_KEY);
  }
}

export const socketService = new SocketService();
''',
)

replace_once(
    "webapp/src/services/apiClient.ts",
    "    !normalizedUrl.includes('/auth/register') &&\n    !normalizedUrl.includes('/auth/refresh')",
    "    !normalizedUrl.includes('/auth/register') &&\n    !normalizedUrl.includes('/auth/guest') &&\n    !normalizedUrl.includes('/auth/refresh')",
)

# ---------------------------------------------------------------------------
# Auth store and guest entry
# ---------------------------------------------------------------------------
replace_once(
    "webapp/src/stores/authStore.ts",
    "  avatarUrl?: string;\n}",
    "  avatarUrl?: string;\n  isGuest?: boolean;\n}",
)
replace_once(
    "webapp/src/stores/authStore.ts",
    "  avatarUrl?: string | null;\n};",
    "  avatarUrl?: string | null;\n  isGuest?: boolean | null;\n};",
)
replace_once(
    "webapp/src/stores/authStore.ts",
    "    avatarUrl: user.avatarUrl ?? fallback?.avatarUrl ?? undefined,\n  };",
    "    avatarUrl: user.avatarUrl ?? fallback?.avatarUrl ?? undefined,\n    isGuest:\n      user.isGuest ??\n      fallback?.isGuest ??\n      email.toLowerCase().endsWith('@guest.quizroyale.invalid'),\n  };",
)

write(
    "webapp/src/pages/LoginPage.tsx",
    '''import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from '../navigation';

import { api } from '@services/apiClient';
import { socketService } from '@services/socketService';
import { useMountedRef } from '@hooks/useMountedRef';
import { type AuthResponse, useAuthStore } from '@stores/authStore';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type FormData = z.infer<typeof schema>;
type RoomFlowResponse = {
  roomId?: string;
  roomCode?: string;
  wsToken?: string;
  room?: { roomId?: string; id?: string; code?: string; roomCode?: string };
};

const normalizeCode = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const validCode = (value: string) => value.length === 6 || value.length === 8;

export default function LoginPage() {
  const navigate = useNavigate();
  const mountedRef = useMountedRef();
  const setSession = useAuthStore((state) => state.setSession);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const invitedCode = normalizeCode(
    new URLSearchParams(window.location.search).get('roomCode') ?? '',
  );
  const [guestCode, setGuestCode] = useState(invitedCode);
  const [guestName, setGuestName] = useState('');
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      const response = await api.post<AuthResponse>('/auth/login', {
        email: data.email.trim().toLowerCase(),
        password: data.password,
      });
      if (!mountedRef.current) return;
      setSession(response.data);
      navigate('/home', { replace: true });
    } catch (error: unknown) {
      if (!mountedRef.current) return;
      setError('root', {
        message: error instanceof Error ? error.message : 'Login failed. Check your credentials.',
      });
    }
  };

  const joinAsGuest = async () => {
    const roomCode = normalizeCode(guestCode);
    if (!validCode(roomCode) || guestLoading) return;

    setGuestLoading(true);
    setGuestError(null);
    try {
      const authResponse = await api.post<AuthResponse>('/auth/guest', {
        roomCode,
        displayName: guestName.trim() || undefined,
      });
      if (!mountedRef.current) return;
      setSession(authResponse.data);

      const joinResponse = await api.post<RoomFlowResponse>('/rooms/join', { roomCode });
      const room = joinResponse.data.room ?? {};
      const roomId = joinResponse.data.roomId ?? room.roomId ?? room.id;
      const joinedCode = joinResponse.data.roomCode ?? room.code ?? room.roomCode ?? roomCode;
      if (!roomId || !joinedCode) throw new Error('Room response is incomplete');

      const socketToken = joinResponse.data.wsToken ?? authResponse.data.accessToken;
      socketService.connect(socketToken);
      socketService.setActiveRoom({ roomId, roomCode: joinedCode });
      socketService.joinRoom(joinedCode, roomId);
      navigate(`/lobby/${roomId}`, { replace: true });
    } catch (error: unknown) {
      clearAuth();
      if (mountedRef.current) {
        setGuestError(error instanceof Error ? error.message : 'Unable to join as guest');
      }
    } finally {
      if (mountedRef.current) setGuestLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-game-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-black text-white">Quiz Royale</h1>
          <p className="text-brand font-semibold text-xl">Showdown</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="bg-game-surface rounded-3xl p-6 border border-game-border shadow-royale space-y-4">
          <h2 className="text-white text-xl font-bold text-center">Sign In</h2>
          <div>
            <label htmlFor="login-email" className="block text-xs text-game-muted mb-1">Email</label>
            <input {...register('email')} id="login-email" type="email" autoComplete="email" className="w-full bg-game-card border border-game-border rounded-xl px-4 py-3 text-white placeholder-game-muted focus:outline-none focus:border-brand" placeholder="you@example.com" />
            {errors.email && <p className="text-answer-wrong text-xs mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label htmlFor="login-password" className="block text-xs text-game-muted mb-1">Password</label>
            <input {...register('password')} id="login-password" type="password" autoComplete="current-password" className="w-full bg-game-card border border-game-border rounded-xl px-4 py-3 text-white placeholder-game-muted focus:outline-none focus:border-brand" placeholder="********" />
            {errors.password && <p className="text-answer-wrong text-xs mt-1">{errors.password.message}</p>}
          </div>
          {errors.root && <p className="text-answer-wrong text-sm text-center">{errors.root.message}</p>}
          <button type="submit" disabled={isSubmitting} className="w-full py-3 rounded-xl bg-brand text-white font-bold text-lg shadow-royale disabled:opacity-60">
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
          <p className="text-center text-game-muted text-sm">No account? <Link to="/register" className="text-brand hover:underline font-semibold">Register</Link></p>
        </form>

        <section className="bg-game-surface rounded-3xl p-6 border border-brand/30 shadow-royale space-y-3">
          <h2 className="text-white text-xl font-bold text-center">Play as Guest</h2>
          <p className="text-game-muted text-sm text-center">Enter a room key. No signup is required.</p>
          <input value={guestCode} onChange={(event) => setGuestCode(normalizeCode(event.target.value))} aria-label="Guest room code" placeholder="Room key" className="w-full bg-game-card border border-game-border rounded-xl px-4 py-3 text-white uppercase tracking-widest font-mono focus:outline-none focus:border-brand" />
          <input value={guestName} onChange={(event) => setGuestName(event.target.value.slice(0, 40))} aria-label="Guest display name" placeholder="Display name (optional)" className="w-full bg-game-card border border-game-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand" />
          <button type="button" onClick={() => void joinAsGuest()} disabled={!validCode(guestCode) || guestLoading} className="w-full py-3 rounded-xl bg-brand-gold text-black font-black disabled:opacity-40">
            {guestLoading ? 'Joining...' : 'Join Room as Guest'}
          </button>
          {guestError && <p className="text-answer-wrong text-sm text-center">{guestError}</p>}
        </section>
      </div>
    </div>
  );
}
''',
)

# ---------------------------------------------------------------------------
# Guest backend session
# ---------------------------------------------------------------------------
replace_once("backend/src/routes/auth.ts", 'import bcrypt from "bcrypt";', 'import bcrypt from "bcrypt";\nimport { randomBytes } from "node:crypto";')
replace_once(
    "backend/src/routes/auth.ts",
    "  findUserById,\n  issueTokenPair,",
    "  findUserById,\n  issueTokenPair,\n  signTokenPair,",
)
replace_once(
    "backend/src/routes/auth.ts",
    'import { ConflictError, ForbiddenError, UnauthorizedError } from "../utils/errors";',
    'import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from "../utils/errors";',
)
replace_once(
    "backend/src/routes/auth.ts",
    'import { buildAutoDisplayName } from "../utils/publicDisplayName";',
    'import { buildAutoDisplayName } from "../utils/publicDisplayName";\nimport { buildGuestEmail } from "../utils/guestUsers";',
)
replace_once(
    "backend/src/routes/auth.ts",
    "const loginSchema = z.object({\n  email: z.string().email(),\n  password: z.string().min(1)\n});",
    "const loginSchema = z.object({\n  email: z.string().email(),\n  password: z.string().min(1)\n});\n\nconst guestSchema = z.object({\n  roomCode: z.string().trim().refine((value) => value.length === 6 || value.length === 8,\n    \"roomCode must be 6 characters (8-character legacy codes are accepted)\"\n  ).transform((value) => value.toUpperCase()),\n  displayName: optionalDisplayNameSchema\n});",
)
login_marker = 'authRouter.post("/login", validate({ body: loginSchema }), async (req, res, next) => {'
guest_route = '''authRouter.post("/guest", validate({ body: guestSchema }), async (req, res, next) => {
  try {
    const { roomCode, displayName } = req.body as z.infer<typeof guestSchema>;
    const room = await prisma.room.findUnique({
      where: { code: roomCode },
      select: { id: true, status: true }
    });

    if (!room) {
      throw new NotFoundError(`Room with code ${roomCode} not found`);
    }
    if (room.status !== "WAITING") {
      throw new ForbiddenError("Room is no longer accepting guest players");
    }

    const userId = generateId();
    const resolvedDisplayName = displayName?.trim() || buildAutoDisplayName(userId);
    const user = await prisma.user.create({
      data: {
        id: userId,
        email: buildGuestEmail(userId),
        displayName: resolvedDisplayName,
        passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), BCRYPT_ROUNDS)
      },
      select: { id: true, email: true, displayName: true }
    });
    const { accessToken } = signTokenPair(user);

    res.status(201).json({
      user: { ...user, isGuest: true },
      accessToken,
      roomCode
    });
  } catch (error) {
    next(error);
  }
});

'''
replace_once("backend/src/routes/auth.ts", login_marker, guest_route + login_marker)

# ---------------------------------------------------------------------------
# Room configuration, atomic start, guest boundaries, solo timeout
# ---------------------------------------------------------------------------
replace_once(
    "backend/src/services/RoomService.ts",
    'import { logger } from "../utils/logger";',
    'import { logger } from "../utils/logger";\nimport { resolvePublicDisplayName } from "../utils/publicDisplayName";',
)
replace_once(
    "backend/src/services/RoomService.ts",
    "interface CreateRoomOpts {\n  isPrivate: boolean;\n  maxPlayers: number;\n}",
    "interface CreateRoomOpts {\n  isPrivate: boolean;\n  maxPlayers: number;\n  autoStartSolo: boolean;\n}",
)
replace_once(
    "backend/src/services/RoomService.ts",
    "interface RoomConfig {\n  isPrivate: boolean;\n  maxPlayers: number;\n}",
    "interface RoomConfig {\n  isPrivate: boolean;\n  maxPlayers: number;\n  autoStartSolo: boolean;\n}",
)
replace_once(
    "backend/src/services/RoomService.ts",
    "const DEFAULT_ROOM_CONFIG: RoomConfig = {\n  isPrivate: true,\n  maxPlayers: 8,\n};",
    "const DEFAULT_ROOM_CONFIG: RoomConfig = {\n  isPrivate: true,\n  maxPlayers: 8,\n  autoStartSolo: false,\n};",
)
replace_once(
    "backend/src/services/RoomService.ts",
    "      maxPlayers: opts.maxPlayers ?? DEFAULT_ROOM_CONFIG.maxPlayers,\n    };",
    "      maxPlayers: opts.maxPlayers ?? DEFAULT_ROOM_CONFIG.maxPlayers,\n      autoStartSolo: opts.autoStartSolo ?? DEFAULT_ROOM_CONFIG.autoStartSolo,\n    };",
)
replace_once(
    "backend/src/services/RoomService.ts",
    '''    await prisma.room.update({
      where: { id: roomId },
      data: {
        status: "COUNTDOWN",
        startedAt: new Date(),
      },
    });

    logger.info("Game started", { roomId, hostUserId: requesterId });''',
    '''    const startResult = await prisma.room.updateMany({
      where: {
        id: roomId,
        hostUserId: requesterId,
        status: "WAITING",
      },
      data: {
        status: "COUNTDOWN",
        startedAt: new Date(),
      },
    });

    if (startResult.count !== 1) {
      throw new ConflictError("Game has already started");
    }

    logger.info("Game started", { roomId, hostUserId: requesterId });''',
)
replace_once(
    "backend/src/services/RoomService.ts",
    "      displayName: player.user.displayName,",
    "      displayName: resolvePublicDisplayName(player.user.displayName, player.user.id),",
)

replace_once(
    "backend/src/routes/rooms.ts",
    'import { isAutomatedTestUser } from "../utils/testUsers";',
    'import { isAutomatedTestUser } from "../utils/testUsers";\nimport { isGuestEmail } from "../utils/guestUsers";',
)
replace_once(
    "backend/src/routes/rooms.ts",
    '  difficulty: gameDifficultySchema.optional().default("medium"),\n});',
    '  difficulty: gameDifficultySchema.optional().default("medium"),\n  autoStartSolo: z.boolean().optional().default(false),\n});',
)
helper_marker = "async function assertTestRoomBoundary(\n"
registered_helper = '''async function assertRegisteredAccount(userId: string, action: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true }
  });
  if (!user) throw new UnauthorizedError("User not found");
  if (isGuestEmail(user.email)) {
    throw new ForbiddenError(`Guest players cannot ${action}`);
  }
}

'''
replace_once("backend/src/routes/rooms.ts", helper_marker, registered_helper + helper_marker)
replace_once(
    "backend/src/routes/rooms.ts",
    "      const input = req.body as z.infer<typeof createRoomSchema>;\n      const room = await roomService.createRoom(hostUserId, input);",
    "      const input = req.body as z.infer<typeof createRoomSchema>;\n      await assertRegisteredAccount(hostUserId, \"create rooms\");\n      const room = await roomService.createRoom(hostUserId, input);",
)
replace_once(
    "backend/src/routes/rooms.ts",
    "      const { roomCode } = req.body as z.infer<typeof joinRoomSchema>;\n\n      await assertTestRoomBoundary(userId, roomCode);",
    "      const { roomCode } = req.body as z.infer<typeof joinRoomSchema>;\n\n      if (!roomCode) await assertRegisteredAccount(userId, \"use public matchmaking\");\n      await assertTestRoomBoundary(userId, roomCode);",
)
old_start = '''      await roomService.recoverStaleCountdown(
        roomId,
        gameOrchestrator.hasActiveGame(roomId)
      );

      const room = await roomService.startGame(roomId, requesterId, { allowSolo });
      const difficulty = await getRoomGameDifficulty(roomId);

      try {
        await gameOrchestrator.assertQuestionBankReady(difficulty);
      } catch (error) {
        await roomService.resetStartFailure(
          roomId,
          error instanceof Error ? error.message : String(error)
        );
        throw error;
      }

      const playerRows = await prisma.roomPlayer.findMany({
        where: { roomId },
        select: { userId: true },
      });
      const playerIds = playerRows.map((row) => row.userId);

      void gameOrchestrator.startGame(roomId, playerIds, getIo()).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[rooms] GameOrchestrator.startGame failed", { roomId, message });
      });

      res.json(formatRoomResponse(room, difficulty));'''
new_start = '''      await roomService.recoverStaleCountdown(
        roomId,
        gameOrchestrator.hasActiveGame(roomId)
      );

      const currentRoom = await roomService.getRoomById(roomId);
      const difficulty = await getRoomGameDifficulty(roomId);
      await gameOrchestrator.assertQuestionBankReady(
        difficulty,
        currentRoom.room.totalRounds,
      );
      const room = await roomService.startGame(roomId, requesterId, { allowSolo });

      const playerRows = await prisma.roomPlayer.findMany({
        where: { roomId },
        select: { userId: true },
      });
      const playerIds = playerRows.map((row) => row.userId);
      const io = getIo();

      void gameOrchestrator.startGame(roomId, playerIds, io).catch(async (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[rooms] GameOrchestrator.startGame failed", { roomId, message });
        await roomService.resetStartFailure(roomId, message).catch(() => undefined);
        const recovered = await roomService.getRoomById(roomId).catch(() => null);
        if (recovered) {
          io.to(roomId).emit("message", {
            type: "room:state_sync",
            version: "v1",
            payload: { room: recovered.room },
          });
        }
        io.to(roomId).emit("message", {
          type: "error",
          version: "v1",
          payload: { code: "GAME_START_FAILED", message },
        });
      });

      res.json(formatRoomResponse(room, difficulty));'''
replace_once("backend/src/routes/rooms.ts", old_start, new_start)

# Home page: no token persistence, explicit solo-auto-start room config, guest-safe menu.
replace_once(
    "webapp/src/pages/HomePage.tsx",
    '''    socketService.setActiveRoom({
      roomId: session.roomId,
      roomCode: session.roomCode,
      token: socketToken,
    });''',
    '''    socketService.setActiveRoom({
      roomId: session.roomId,
      roomCode: session.roomCode,
    });''',
)
replace_once(
    "webapp/src/pages/HomePage.tsx",
    "      const response = await api.post('/rooms', { isPrivate, maxPlayers: 8 });",
    "      const response = await api.post('/rooms', {\n        isPrivate,\n        maxPlayers: 8,\n        autoStartSolo: action === 'solo',\n      });",
)
replace_once(
    "webapp/src/pages/HomePage.tsx",
    "  const [launchNotice, setLaunchNotice] = useState<string | null>(null);",
    "  const [launchNotice, setLaunchNotice] = useState<string | null>(null);\n  const isGuest = user?.isGuest === true;",
)
replace_once(
    "webapp/src/pages/HomePage.tsx",
    '''        <button
          onClick={quickPlay}''',
    '''        {!isGuest && <button
          onClick={quickPlay}''',
)
replace_once(
    "webapp/src/pages/HomePage.tsx",
    '''        </button>

        <button
          onClick={() => createRoom(true, 'solo')}''',
    '''        </button>}

        {!isGuest && <button
          onClick={() => createRoom(true, 'solo')}''',
)
replace_once(
    "webapp/src/pages/HomePage.tsx",
    '''        </button>
        <p className="-mt-2 text-center text-xs text-game-muted">
          Create a private lobby, then tap Play Solo.
        </p>

        <button
          onClick={() => createRoom(true)}''',
    '''        </button>}
        {!isGuest && <p className="-mt-2 text-center text-xs text-game-muted">
          Create a private lobby, then tap Play Solo or wait for the solo countdown.
        </p>}

        {!isGuest && <button
          onClick={() => createRoom(true)}''',
)
replace_once(
    "webapp/src/pages/HomePage.tsx",
    '''        </button>

        <div className="w-full border-t border-game-border pt-4">''',
    '''        </button>}

        <div className="w-full border-t border-game-border pt-4">''',
)

# Lobby: memory-only socket token, REST start fallback, and 30 second solo auto-start.
replace_once(
    "webapp/src/pages/LobbyPage.tsx",
    "  config: { difficulty: GameDifficulty };",
    "  config: { difficulty: GameDifficulty; autoStartSolo?: boolean };",
)
replace_once(
    "webapp/src/pages/LobbyPage.tsx",
    "    const activeRoom = socketService.getActiveRoom();\n    const token = activeRoom?.token ?? accessToken;\n    const roomCode = activeRoom?.roomCode ?? code;",
    "    const activeRoom = socketService.getActiveRoom();\n    const token = accessToken;\n    const roomCode = activeRoom?.roomCode ?? code;",
)
replace_once(
    "webapp/src/pages/LobbyPage.tsx",
    "    socketService.setActiveRoom({ roomId, roomCode, token });",
    "    socketService.setActiveRoom({ roomId, roomCode });",
)
replace_once(
    "webapp/src/pages/LobbyPage.tsx",
    "  const [difficulty, setDifficulty] = useState<GameDifficulty>('medium');",
    "  const [difficulty, setDifficulty] = useState<GameDifficulty>('medium');\n  const [autoStartSolo, setAutoStartSolo] = useState(false);\n  const [soloSecondsRemaining, setSoloSecondsRemaining] = useState<number | null>(null);",
)
replace_once(
    "webapp/src/pages/LobbyPage.tsx",
    "          setDifficulty(response.data.config.difficulty);",
    "          setDifficulty(response.data.config.difficulty);\n          setAutoStartSolo(response.data.config.autoStartSolo === true);",
)
old_try = "      await api.post(`/rooms/${roomId}/start`, { allowSolo: !hasMultiplePlayers });"
new_try = '''      const response = await api.post<RoomStateResponse>(
        `/rooms/${roomId}/start`,
        { allowSolo: !hasMultiplePlayers },
      );
      if (!mountedRef.current) return;
      applyRoomState({ room: response.data.room });
      if (response.data.room.phase !== 'WAITING') {
        navigate(`/game/${roomId}`, { replace: true });
      }'''
replace_once("webapp/src/pages/LobbyPage.tsx", old_try, new_try)
replace_once(
    "webapp/src/pages/LobbyPage.tsx",
    "  }, [difficulty, hasMultiplePlayers, isHost, mountedRef, roomId]);",
    "  }, [applyRoomState, difficulty, hasMultiplePlayers, isHost, mountedRef, navigate, roomId]);",
)
insert_before_leave = "\n  const handleLeaveLobby = async () => {"
solo_effect = '''
  useEffect(() => {
    if (!autoStartSolo || !isHost || phase !== 'WAITING' || hasMultiplePlayers || isStarting) {
      setSoloSecondsRemaining(null);
      return;
    }

    const deadline = Date.now() + 30_000;
    const updateCountdown = () => {
      setSoloSecondsRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    };
    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1000);
    const timeoutId = window.setTimeout(() => void handleStartGame(), 30_000);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [autoStartSolo, handleStartGame, hasMultiplePlayers, isHost, isStarting, phase]);
'''
replace_once("webapp/src/pages/LobbyPage.tsx", insert_before_leave, solo_effect + insert_before_leave)
replace_once(
    "webapp/src/pages/LobbyPage.tsx",
    "                        : `Play all ten trivia rounds by yourself on ${difficulty} difficulty.`}",
    "                        : `Play all ten trivia rounds by yourself on ${difficulty} difficulty.${soloSecondsRemaining !== null ? ` Auto-starting in ${soloSecondsRemaining}s.` : ''}`}",
)

# ---------------------------------------------------------------------------
# Winner names and guest score isolation
# ---------------------------------------------------------------------------
replace_once(
    "webapp/src/stores/gameStore.ts",
    "export interface FinalStanding {\n  playerId: string;",
    "export interface FinalStanding {\n  playerId: string;\n  displayName: string;",
)
write(
    "webapp/src/pages/ResultsPage.tsx",
    '''import React, { useEffect } from 'react';
import { useNavigate, useParams } from '../navigation';
import { useGameStore } from '@stores/gameStore';
import { useAuthStore } from '@stores/authStore';
import { PlayerAvatar } from '@components/PlayerAvatar';
import { socketService } from '@services/socketService';
import { resolvePlayerName } from '@/utils/playerNames';

export default function ResultsPage() {
  const navigate = useNavigate();
  const { roomId: _roomId } = useParams<{ roomId: string }>();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const finalScores = useGameStore((s) => s.finalScores);
  const winnerId = useGameStore((s) => s.winnerId);
  const resetRoom = useGameStore((s) => s.resetRoom);

  useEffect(() => () => resetRoom(), [resetRoom]);

  const returnHome = () => {
    socketService.disconnect(true);
    resetRoom();
    if (user?.isGuest) {
      clearAuth();
      navigate('/login', { replace: true });
    } else {
      navigate('/home', { replace: true });
    }
  };

  if (!finalScores.length) {
    return <div className="min-h-screen bg-game-bg flex items-center justify-center"><p className="text-game-muted">No results available.</p></div>;
  }

  const myScore = finalScores.find((score) => score.playerId === user?.id);
  const winner = finalScores.find((score) => score.playerId === winnerId) ?? finalScores[0];
  const winnerName = resolvePlayerName(winner?.displayName, winner?.playerId ?? 'winner');

  return (
    <div className="min-h-screen bg-game-bg flex flex-col p-4">
      <div className="max-w-lg mx-auto w-full flex flex-col gap-4 py-6">
        <div className="text-center">
          <p className="text-5xl mb-2">{myScore?.rank === 1 ? '🏆' : myScore?.rank === 2 ? '🥈' : myScore?.rank === 3 ? '🥉' : '🎮'}</p>
          <h1 className="text-white text-3xl font-black">Game Over!</h1>
          <p className="text-gold font-semibold mt-1">Winner: {winnerName}</p>
          {myScore && <p className="text-game-muted text-sm">Your rank: #{myScore.rank}</p>}
        </div>

        {myScore && myScore.xpAwarded > 0 && <div className="bg-game-surface rounded-2xl p-4 text-center border border-game-border"><p className="text-game-muted text-xs uppercase tracking-wide">XP Earned</p><p className="text-gold text-3xl font-black">+{myScore.xpAwarded} XP</p></div>}

        <div className="bg-game-surface rounded-2xl border border-game-border overflow-hidden">
          <div className="px-4 py-3 border-b border-game-border"><h2 className="text-white font-bold">Final Standings</h2></div>
          <div className="divide-y divide-game-border">
            {finalScores.map((standing, index) => {
              const playerName = resolvePlayerName(standing.displayName, standing.playerId);
              return <div key={standing.playerId} className={`flex items-center gap-3 px-4 py-3 ${standing.playerId === user?.id ? 'bg-brand/10' : ''}`}>
                <span className="text-lg w-8 text-center">{index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}</span>
                <PlayerAvatar username={playerName} size="xs" />
                <span className="flex-1 text-white text-sm font-medium truncate">{playerName}{standing.playerId === user?.id ? ' (you)' : ''}</span>
                <span className="text-white font-bold text-sm tabular-nums">{standing.score.toLocaleString()}</span>
                {standing.xpAwarded > 0 && <span className="text-gold text-xs">+{standing.xpAwarded}xp</span>}
              </div>;
            })}
          </div>
        </div>

        <button onClick={returnHome} className="w-full py-3 rounded-xl bg-brand text-white font-bold shadow-royale hover:opacity-90">
          {user?.isGuest ? 'Join Another Room' : 'Return Home'}
        </button>
      </div>
    </div>
  );
}
''',
)
replace_once(
    "android/app/src/main/java/com/quizroyale/showdown/data/game/GameModels.kt",
    "data class FinalStanding(\n  val playerId: String,",
    "data class FinalStanding(\n  val playerId: String,\n  val displayName: String,",
)
replace_once(
    "android/app/src/main/java/com/quizroyale/showdown/data/game/GameRepository.kt",
    "              playerId = standing.optString(\"playerId\"),\n              rank = standing.optInt",
    "              playerId = standing.optString(\"playerId\"),\n              displayName = standing.optString(\"displayName\", \"userID001\"),\n              rank = standing.optInt",
)

replace_once(
    "backend/src/services/GameOrchestrator.ts",
    'import { resolvePublicDisplayName } from "../utils/publicDisplayName";',
    'import { resolvePublicDisplayName } from "../utils/publicDisplayName";\nimport { isGuestEmail } from "../utils/guestUsers";',
)
replace_once(
    "backend/src/services/GameOrchestrator.ts",
    'import { redisService } from "./RedisService";',
    'import { redisService } from "./RedisService";\nimport { questionGeneratorService } from "./QuestionGeneratorService";',
)
replace_once(
    "backend/src/services/GameOrchestrator.ts",
    "type FinalStanding = {\n  playerId: string;",
    "type FinalStanding = {\n  playerId: string;\n  displayName: string;",
)
regex_once(
    "backend/src/services/GameOrchestrator.ts",
    r'''  async assertQuestionBankReady\(\n    gameDifficulty: GameDifficulty = DEFAULT_GAME_DIFFICULTY\n  \): Promise<void> \{.*?\n  \}\n\n  async startGame''',
    '''  async assertQuestionBankReady(
    gameDifficulty: GameDifficulty = DEFAULT_GAME_DIFFICULTY,
    minimumRequired = 10,
  ): Promise<void> {
    const allowedDifficulties = [...getAllowedQuestionDifficulties(gameDifficulty)];
    let activeQuestionCount = await prisma.questionBank.count({
      where: { isActive: true, difficulty: { in: allowedDifficulties } }
    });

    if (activeQuestionCount < minimumRequired) {
      activeQuestionCount = await questionGeneratorService.ensureCapacity(
        allowedDifficulties,
        minimumRequired,
      );
    }

    if (activeQuestionCount < minimumRequired) {
      throw new BadRequestError(
        `At least ${minimumRequired} active ${gameDifficulty} questions are required; ${activeQuestionCount} are available.`
      );
    }
  }

  async startGame''',
    flags=re.S,
)
old_game_over = '''    const finalScores = await this.loadScores(roomId, finalistIds);
    const finalStandings = finalScores
      .sort((left, right) =>
        (right.totalScore ?? right.roundScore) - (left.totalScore ?? left.roundScore) ||
        left.playerId.localeCompare(right.playerId)
      )
      .map((standing, index) => {
        const score = standing.totalScore ?? standing.roundScore;

        return {
          playerId: standing.playerId,
          rank: index + 1,
          score,
          xpAwarded: Math.max(10, Math.round(score / 10))
        };
      });

    await this.updateSeasonScores(roomId, finalStandings, winnerIds);

    await Promise.all(
      finalStandings.map((standing) =>
        prisma.xpEvent.create({
          data: {
            id: generateId(),
            userId: standing.playerId,
            reason: "GAME_FINISH",
            amount: standing.xpAwarded,
            metadata: { roomId, rank: standing.rank }
          }
        })
      )
    );'''
new_game_over = '''    const finalScores = await this.loadScores(roomId, finalistIds);
    const userRows = await prisma.user.findMany({
      where: { id: { in: finalScores.map((standing) => standing.playerId) } },
      select: { id: true, email: true, displayName: true }
    });
    const usersById = new Map(userRows.map((user) => [user.id, user]));
    const guestIds = new Set(userRows.filter((user) => isGuestEmail(user.email)).map((user) => user.id));
    const finalStandings = finalScores
      .sort((left, right) =>
        (right.totalScore ?? right.roundScore) - (left.totalScore ?? left.roundScore) ||
        left.playerId.localeCompare(right.playerId)
      )
      .map((standing, index) => {
        const score = standing.totalScore ?? standing.roundScore;
        const user = usersById.get(standing.playerId);
        const isGuest = guestIds.has(standing.playerId);

        return {
          playerId: standing.playerId,
          displayName: resolvePublicDisplayName(user?.displayName, standing.playerId),
          rank: index + 1,
          score,
          xpAwarded: isGuest ? 0 : Math.max(10, Math.round(score / 10))
        };
      });
    const persistentStandings = finalStandings.filter((standing) => !guestIds.has(standing.playerId));

    await this.updateSeasonScores(roomId, persistentStandings, winnerIds);

    await Promise.all(
      persistentStandings.map((standing) =>
        prisma.xpEvent.create({
          data: {
            id: generateId(),
            userId: standing.playerId,
            reason: "GAME_FINISH",
            amount: standing.xpAwarded,
            metadata: { roomId, rank: standing.rank }
          }
        })
      )
    );'''
replace_once("backend/src/services/GameOrchestrator.ts", old_game_over, new_game_over)
regex_once(
    "backend/src/services/GameOrchestrator.ts",
    r'''  private async selectQuestion\(\n    usedIds: string\[],\n    targetDifficulty: Difficulty,\n    gameDifficulty: GameDifficulty\n  \): Promise<QuestionBank> \{.*?\n  \}\n\n  private async loadScores''',
    '''  private async selectQuestion(
    usedIds: string[],
    targetDifficulty: Difficulty,
    gameDifficulty: GameDifficulty
  ): Promise<QuestionBank> {
    const allowedDifficulties = [...getAllowedQuestionDifficulties(gameDifficulty)];
    const preferredDifficulties = [
      targetDifficulty,
      ...allowedDifficulties.filter((difficulty) => difficulty !== targetDifficulty)
    ];

    const findCandidate = async (): Promise<QuestionBank | null> => {
      for (const difficulty of preferredDifficulties) {
        const candidates = await prisma.questionBank.findMany({
          where: {
            isActive: true,
            difficulty,
            id: { notIn: usedIds.length > 0 ? usedIds : undefined }
          },
          orderBy: [{ lastUsedAt: "asc" }, { createdAt: "asc" }],
          take: 50
        });
        if (candidates.length > 0) return candidates[randomInt(candidates.length)];
      }
      return null;
    };

    let question = await findCandidate();
    if (!question) {
      await questionGeneratorService.ensureCapacity(allowedDifficulties, 10);
      question = await findCandidate();
    }
    if (!question) {
      throw new Error(`No unused ${gameDifficulty} questions are available in the bank`);
    }

    await prisma.questionBank.update({
      where: { id: question.id },
      data: { lastUsedAt: new Date() }
    });
    return question;
  }

  private async loadScores''',
    flags=re.S,
)

# ---------------------------------------------------------------------------
# Bounded OpenAI question replenishment
# ---------------------------------------------------------------------------
write(
    "backend/src/services/QuestionGeneratorService.ts",
    '''import OpenAI from "openai";
import { Difficulty } from "@prisma/client";
import { z } from "zod";

import { env } from "../config/env";
import { prisma } from "../models/prismaClient";
import { logger } from "../utils/logger";
import { generateId } from "../utils/ulid";
import { redisService } from "./RedisService";

const DEFAULT_REFILL_THRESHOLD = 60;
const DEFAULT_BATCH_SIZE = 30;
const MAX_BATCH_SIZE = 60;
const REFILL_LOCK_SECONDS = 300;
const REFILL_LOCK_KEY = "questions:ai-refill-lock";
const MODEL = process.env.OPENAI_QUESTION_MODEL?.trim() || "gpt-5-mini";

const AI_CATEGORIES = [
  "Technology and AI", "Science", "World History", "Sports", "Geography",
  "Gaming", "Food and Drink", "Music", "Film and Television", "General Knowledge"
] as const;

const generatedQuestionSchema = z.object({
  prompt: z.string().trim().min(8).max(300),
  options: z.array(z.string().trim().min(1).max(160)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  category: z.string().trim().min(2).max(80),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
});
const responseSchema = z.object({ questions: z.array(generatedQuestionSchema).max(MAX_BATCH_SIZE) });
type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;

function boundedNumber(raw: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

const refillThreshold = boundedNumber(process.env.QUESTION_REFILL_THRESHOLD, DEFAULT_REFILL_THRESHOLD, 10, 500);
const refillBatchSize = boundedNumber(process.env.QUESTION_REFILL_BATCH_SIZE, DEFAULT_BATCH_SIZE, 10, MAX_BATCH_SIZE);

function toDifficulty(value: GeneratedQuestion["difficulty"]): Difficulty {
  return value === "HARD" ? Difficulty.HARD : value === "MEDIUM" ? Difficulty.MEDIUM : Difficulty.EASY;
}

export class QuestionGeneratorService {
  private readonly client = env.openAiApiKey ? new OpenAI({ apiKey: env.openAiApiKey }) : null;
  private localRefillInProgress = false;

  get isAvailable(): boolean {
    return this.client !== null;
  }

  async ensureCapacity(
    allowedDifficulties: Difficulty[],
    minimumRequired = 10,
  ): Promise<number> {
    const target = Math.max(minimumRequired, refillThreshold);
    let count = await this.countEligible(allowedDifficulties);
    if (count >= target || !this.client) return count;

    const ownsLock = await this.acquireRefillLock();
    if (!ownsLock) return count;

    try {
      count = await this.countEligible(allowedDifficulties);
      if (count >= target) return count;
      const requested = Math.min(
        MAX_BATCH_SIZE,
        Math.max(refillBatchSize, target - count),
      );
      const added = await this.generateAndStore(requested, allowedDifficulties);
      logger.info("AI question bank refill completed", { countBefore: count, requested, added });
      return this.countEligible(allowedDifficulties);
    } catch (error) {
      logger.error("AI question bank refill failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return count;
    } finally {
      await this.releaseRefillLock();
    }
  }

  async generateAndStore(
    targetCount = DEFAULT_BATCH_SIZE,
    allowedDifficulties: Difficulty[] = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD],
  ): Promise<number> {
    if (!this.client) {
      logger.warn("AI question generation skipped because OPENAI_API_KEY is not configured");
      return 0;
    }

    const boundedTarget = Math.min(MAX_BATCH_SIZE, Math.max(1, Math.floor(targetCount)));
    const questions = await this.generateBatch(boundedTarget, allowedDifficulties);
    let added = 0;
    for (const question of questions) {
      if (await this.storeQuestion(question)) added += 1;
    }
    return added;
  }

  async refillIfNeeded(): Promise<void> {
    await this.ensureCapacity([Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD], 10);
  }

  private async generateBatch(count: number, allowedDifficulties: Difficulty[]): Promise<GeneratedQuestion[]> {
    const allowedNames = allowedDifficulties.map(String);
    const category = AI_CATEGORIES[Math.floor(Math.random() * AI_CATEGORIES.length)];
    const response = await this.client!.responses.create({
      model: MODEL,
      store: false,
      max_output_tokens: 12000,
      input: `Generate ${count} factually accurate, unique multiple-choice trivia questions for Quiz Royale. Focus broadly on ${category}. Allowed difficulties: ${allowedNames.join(", ")}. Use exactly four plausible options, vary the correct option position, avoid time-sensitive claims, and do not repeat common seed questions.`,
      text: {
        format: {
          type: "json_schema",
          name: "quiz_royale_questions",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["questions"],
            properties: {
              questions: {
                type: "array",
                maxItems: count,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["prompt", "options", "correctIndex", "category", "difficulty"],
                  properties: {
                    prompt: { type: "string" },
                    options: { type: "array", minItems: 4, maxItems: 4, items: { type: "string" } },
                    correctIndex: { type: "integer", minimum: 0, maximum: 3 },
                    category: { type: "string" },
                    difficulty: { type: "string", enum: allowedNames },
                  },
                },
              },
            },
          },
        },
      },
    });
    return responseSchema.parse(JSON.parse(response.output_text)).questions;
  }

  private async storeQuestion(question: GeneratedQuestion): Promise<boolean> {
    const normalizedPrompt = question.prompt.replace(/\\s+/g, " ").trim();
    const existing = await prisma.questionBank.findFirst({
      where: { prompt: { equals: normalizedPrompt, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) return false;

    await prisma.questionBank.create({
      data: {
        id: generateId(),
        prompt: normalizedPrompt,
        optionA: question.options[0],
        optionB: question.options[1],
        optionC: question.options[2],
        optionD: question.options[3],
        correctIndex: question.correctIndex,
        category: question.category,
        difficulty: toDifficulty(question.difficulty),
        isActive: true,
      },
    });
    return true;
  }

  private countEligible(difficulties: Difficulty[]): Promise<number> {
    return prisma.questionBank.count({
      where: { isActive: true, difficulty: { in: difficulties } },
    });
  }

  private async acquireRefillLock(): Promise<boolean> {
    if (redisService) return redisService.setnx(REFILL_LOCK_KEY, String(Date.now()), REFILL_LOCK_SECONDS);
    if (this.localRefillInProgress) return false;
    this.localRefillInProgress = true;
    return true;
  }

  private async releaseRefillLock(): Promise<void> {
    if (redisService) {
      await redisService.del(REFILL_LOCK_KEY).catch(() => undefined);
    }
    this.localRefillInProgress = false;
  }
}

export const questionGeneratorService = new QuestionGeneratorService();
''',
)

# ---------------------------------------------------------------------------
# Readiness, leaderboard, CSP and Android production target
# ---------------------------------------------------------------------------
write(
    "backend/src/routes/health.ts",
    '''import { Router } from "express";
import type { PrismaClient } from "@prisma/client";

import { prisma } from "../models/prismaClient";
import { redisService, type RedisService } from "../services/RedisService";

export const healthRouter = Router();
type ComponentStatus = "ok" | "unhealthy";
export interface ComponentHealth { status: ComponentStatus; latencyMs?: number; error?: string; }
export interface HealthResponse {
  status: ComponentStatus;
  ts: number;
  version: string;
  service: string;
  timestamp: string;
  components: { postgres: ComponentHealth; redis: ComponentHealth; questions: ComponentHealth };
}
interface HealthDependencies {
  prisma: Pick<PrismaClient, "$queryRawUnsafe"> & { questionBank: Pick<PrismaClient["questionBank"], "count"> };
  redis: Pick<RedisService, "ping"> | null;
  now?: () => Date;
}
const VERSION = process.env.npm_package_version ?? "1.0.0";
const SERVICE = "quiz-royale-backend";
const MIN_READY_QUESTIONS = 10;

async function checkComponent(check: () => Promise<void>): Promise<ComponentHealth> {
  const startedAt = Date.now();
  try {
    await check();
    return { status: "ok", latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      status: "unhealthy",
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Unknown health check failure",
    };
  }
}

export async function getHealth({ prisma: prismaClient, redis, now = () => new Date() }: HealthDependencies): Promise<HealthResponse> {
  const [postgres, redisHealth, questions] = await Promise.all([
    checkComponent(async () => { await prismaClient.$queryRawUnsafe("SELECT 1"); }),
    checkComponent(async () => {
      if (!redis) throw new Error("Redis service is not initialized");
      if (await redis.ping() !== "PONG") throw new Error("Unexpected Redis PING response");
    }),
    checkComponent(async () => {
      const count = await prismaClient.questionBank.count({ where: { isActive: true } });
      if (count < MIN_READY_QUESTIONS) {
        throw new Error(`Only ${count} active questions are available; ${MIN_READY_QUESTIONS} required`);
      }
    }),
  ]);
  const status: ComponentStatus = [postgres, redisHealth, questions].every((item) => item.status === "ok") ? "ok" : "unhealthy";
  const timestamp = now();
  return {
    status,
    ts: timestamp.getTime(),
    version: VERSION,
    service: SERVICE,
    timestamp: timestamp.toISOString(),
    components: { postgres, redis: redisHealth, questions },
  };
}

healthRouter.get("/", (_req, res) => {
  const timestamp = new Date();
  res.status(200).json({ status: "ok", ts: timestamp.getTime(), version: VERSION, service: SERVICE, timestamp: timestamp.toISOString() });
});

healthRouter.get("/ready", async (_req, res) => {
  const health = await getHealth({ prisma, redis: redisService });
  res.status(health.status === "ok" ? 200 : 503).json(health);
});
''',
)

write(
    "backend/src/routes/leaderboard.ts",
    '''import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../models/prismaClient";
import { levelFromTotalXp } from "../services/XpService";
import { resolvePublicDisplayName } from "../utils/publicDisplayName";
import { isGuestEmail } from "../utils/guestUsers";

const router = Router();

function parseLimit(value: unknown): number {
  const parsed = Number(value ?? 100);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 500) : 100;
}

router.get("/", async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit);
    const seasonSlug = String(req.query.season ?? "current");
    const guestFilter = { email: { not: { endsWith: "@guest.quizroyale.invalid" } } };

    if (seasonSlug) {
      const season = await prisma.season.findFirst({
        where: seasonSlug === "current"
          ? { startsAt: { lte: new Date() }, endsAt: { gte: new Date() } }
          : { slug: seasonSlug },
        orderBy: { startsAt: "desc" },
      });
      if (season) {
        const standings = await prisma.seasonScore.findMany({
          where: { seasonId: season.id, user: guestFilter },
          orderBy: { mmr: "desc" },
          take: limit,
          include: { user: { select: { id: true, email: true, displayName: true, avatarUrl: true } } },
        });
        return res.json(standings.filter((row) => !isGuestEmail(row.user.email)).map((row, index) => ({
          rank: index + 1,
          userId: row.userId,
          displayName: resolvePublicDisplayName(row.user.displayName, row.userId),
          avatarUrl: row.user.avatarUrl,
          mmr: row.mmr,
          wins: row.wins,
          gamesPlayed: row.gamesPlayed,
        })));
      }
    }

    const xpSums = await prisma.xpEvent.groupBy({
      by: ["userId"],
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: Math.min(limit * 2, 500),
    });
    const users = await prisma.user.findMany({
      where: { id: { in: xpSums.map((row) => row.userId) }, ...guestFilter },
      select: { id: true, email: true, displayName: true, avatarUrl: true },
    });
    const userMap = new Map(users.filter((user) => !isGuestEmail(user.email)).map((user) => [user.id, user]));
    const rows = xpSums.filter((row) => userMap.has(row.userId)).slice(0, limit);
    res.json(rows.map((row, index) => {
      const totalXp = row._sum.amount ?? 0;
      const user = userMap.get(row.userId)!;
      return {
        rank: index + 1,
        userId: row.userId,
        displayName: resolvePublicDisplayName(user.displayName, row.userId),
        avatarUrl: user.avatarUrl,
        totalXp,
        level: levelFromTotalXp(totalXp),
      };
    }));
  } catch (err) {
    next(err);
  }
});

router.get("/friends", requireAuth, async (_req, res, next) => {
  try { res.json([]); } catch (err) { next(err); }
});

export default router;
''',
)

write(
    "webapp/vercel.json",
    '''{
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://*.railway.app wss://*.railway.app https://*.quizroyale.gg wss://*.quizroyale.gg; worker-src 'self'; manifest-src 'self'" }
      ]
    }
  ],
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
''',
)
replace_once(
    "android/app/build.gradle.kts",
    '.getOrElse("https://api.quizroyale.gg/api/v1/")',
    '.getOrElse("https://quizroyaleshowdown-production.up.railway.app/api/v1/")',
)
replace_once(
    "android/app/build.gradle.kts",
    '.getOrElse("wss://api.quizroyale.gg/ws")',
    '.getOrElse("https://quizroyaleshowdown-production.up.railway.app")',
)

# Ensure example configuration documents the bounded AI refill controls.
replace_once(
    "backend/.env.example",
    "# ─── Admin ──────────────────────────────────────────────────────────────────────",
    "# ─── AI question replenishment ─────────────────────────────────────────────────\nOPENAI_API_KEY=\nOPENAI_QUESTION_MODEL=gpt-5-mini\nQUESTION_REFILL_THRESHOLD=60\nQUESTION_REFILL_BATCH_SIZE=30\n\n# ─── Admin ──────────────────────────────────────────────────────────────────────",
)

print("Applied guest, gameplay, AI replenishment, security, and release fixes.")
