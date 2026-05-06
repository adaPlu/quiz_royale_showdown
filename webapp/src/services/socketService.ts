import { io, type Socket } from 'socket.io-client';
import { z } from 'zod';

const PlayerSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().optional(),
  score: z.number(),
  streak: z.number(),
  isEliminated: z.boolean(),
});

const RoomStatePayload = z.object({
  room: z.object({
    roomId: z.string(),
    code: z.string(),
    hostId: z.string(),
    phase: z.enum([
      'WAITING',
      'COUNTDOWN',
      'QUESTION_ACTIVE',
      'ANSWER_LOCKED',
      'ROUND_RESULT',
      'ELIMINATION',
      'FINALE',
      'GAME_OVER',
    ]),
    roundNumber: z.number(),
    totalRounds: z.number(),
    players: z.array(PlayerSchema),
  }),
});

const CountdownStartPayload = z.object({
  roomId: z.string(),
  startsAt: z.string(),
  seconds: z.number(),
});

const QuestionPayload = z.object({
  roomId: z.string(),
  roundId: z.string(),
  questionId: z.string(),
  prompt: z.string(),
  answers: z.array(z.string()).length(4),
  timeLimitMs: z.number(),
  startedAt: z.string(),
});

const AnswerLockedPayload = z.object({
  roomId: z.string(),
  roundId: z.string(),
  lockedAt: z.string(),
});

const RoundResultPayload = z.object({
  roomId: z.string(),
  roundId: z.string(),
  correctAnswerIndex: z.number(),
  rankings: z.array(
    z.object({ playerId: z.string(), scoreDelta: z.number(), totalScore: z.number() }),
  ),
});

const EliminationPayload = z.object({
  roomId: z.string(),
  eliminatedPlayerIds: z.array(z.string()),
  survivors: z.array(PlayerSchema),
});

const FinaleStartedPayload = z.object({
  roomId: z.string(),
  finalistIds: z.array(z.string()),
});

const PowerupActivatedPayload = z.object({
  roomId: z.string(),
  userId: z.string(),
  powerUpId: z.string(),
  effect: z.record(z.unknown()),
});

const PowerupEffectPayload = z.object({
  roomId: z.string(),
  userId: z.string(),
  powerUpId: z.string(),
  effect: z.record(z.unknown()),
});

const GameOverPayload = z.object({
  roomId: z.string(),
  winnerId: z.string(),
  finalStandings: z.array(
    z.object({
      playerId: z.string(),
      rank: z.number(),
      score: z.number(),
      xpAwarded: z.number(),
    }),
  ),
});

const LevelUpPayload = z.object({
  userId: z.string(),
  newLevel: z.number(),
  xpAwarded: z.number(),
  xpToNextLevel: z.number(),
});

const ErrorPayload = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
  details: z.unknown().optional(),
});

export const ServerEventSchemas = {
  'room:state_sync': RoomStatePayload,
  'room:player_joined': z.object({ roomId: z.string(), player: PlayerSchema }),
  'room:player_left': z.object({ roomId: z.string(), playerId: z.string() }),
  'round:countdown_started': CountdownStartPayload,
  'round:question_started': QuestionPayload,
  'round:answer_locked': AnswerLockedPayload,
  'round:result': RoundResultPayload,
  'round:elimination': EliminationPayload,
  'round:finale_started': FinaleStartedPayload,
  'powerup:activated': PowerupActivatedPayload,
  'powerup:effect': PowerupEffectPayload,
  'powerup:loot_drop': z.object({ powerupId: z.string(), powerupType: z.string(), quantity: z.number() }),
  'game:over': GameOverPayload,
  'game:level_up': LevelUpPayload,
  error: ErrorPayload,
} as const;

export type ServerEventType = keyof typeof ServerEventSchemas;
export type ServerEventPayload<E extends ServerEventType> = z.infer<(typeof ServerEventSchemas)[E]>;

export type ClientEventType =
  | 'room:join'
  | 'room:start'
  | 'room:leave'
  | 'round:submit_answer'
  | 'powerup:activate'
  | 'client:heartbeat';

type ClientEventPayloads = {
  'room:join': { roomCode: string };
  'room:start': { roomId: string };
  'room:leave': { roomId: string };
  'round:submit_answer': {
    roomId: string;
    questionId: string;
    answerIndex: number;
    clientSentAt: string;
  };
  'powerup:activate': { roomId: string; powerUpId: string; targetPlayerId?: string };
  'client:heartbeat': { roomId: string; sentAt: string };
};

type Unsubscribe = () => void;
type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

const ServerEnvelopeSchema = z.object({
  type: z.string(),
  version: z.literal('v1'),
  payload: z.unknown(),
});

class SocketService {
  private socket: Socket | null = null;
  private activeRoomId: string | null = null;
  private activeRoomCode: string | null = null;
  private accessToken: string | null = null;
  private listeners = new Map<ServerEventType, Set<(payload: unknown) => void>>();
  private statusListeners = new Set<(status: ConnectionStatus) => void>();

  onStatusChange(handler: (status: ConnectionStatus) => void): Unsubscribe {
    this.statusListeners.add(handler);
    return () => this.statusListeners.delete(handler);
  }

  private emitStatus(status: ConnectionStatus): void {
    this.statusListeners.forEach((h) => h(status));
  }

  connect(accessToken = ''): void {
    if (!accessToken) return;

    if (this.socket?.connected && this.accessToken === accessToken) return;

    if (this.socket && this.accessToken !== accessToken) {
      this.disconnect();
    }

    const wsUrl = import.meta.env.VITE_WS_BASE_URL ?? 'http://localhost:4000';
    this.accessToken = accessToken;
    this.socket = io(wsUrl, {
      path: '/ws',
      transports: ['websocket'],
      auth: { token: accessToken },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('message', (raw: unknown) => this.handleMessage(raw));
    this.socket.on('connect', () => {
      this.emitStatus('connected');
      if (this.activeRoomCode) {
        this.emit('room:join', { roomCode: this.activeRoomCode });
      }
    });
    this.socket.on('disconnect', () => this.emitStatus('disconnected'));
    this.socket.on('reconnect_attempt', () => this.emitStatus('reconnecting'));
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.accessToken = null;
    this.activeRoomId = null;
    this.activeRoomCode = null;
  }

  setActiveRoom(roomId: string, roomCode?: string): void {
    this.activeRoomId = roomId;
    if (roomCode) this.activeRoomCode = roomCode;
  }

  emit<E extends ClientEventType>(event: E, payload: ClientEventPayloads[E]): void {
    this.socket?.emit('message', { type: event, version: 'v1', payload });
  }

  on<E extends ServerEventType>(
    event: E,
    handler: (payload: ServerEventPayload<E>) => void,
  ): Unsubscribe {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const handlers = this.listeners.get(event)!;
    handlers.add(handler as (payload: unknown) => void);
    return () => {
      handlers.delete(handler as (payload: unknown) => void);
    };
  }

  send(envelope: { type: string; version: 'v1'; payload: Record<string, unknown> }): void {
    this.socket?.emit('message', envelope);
  }

  subscribe(handler: (event: { type: string; version: 'v1'; payload: Record<string, unknown> }) => void): Unsubscribe {
    const unsubs = (Object.keys(ServerEventSchemas) as ServerEventType[]).map((eventType) =>
      this.on(eventType, (payload) => {
        handler({ type: eventType, version: 'v1', payload: payload as Record<string, unknown> });
      }),
    );
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }

  private handleMessage(raw: unknown): void {
    const envelope = ServerEnvelopeSchema.safeParse(raw);
    if (!envelope.success) return;

    const eventType = envelope.data.type as ServerEventType;
    const schema = ServerEventSchemas[eventType];
    if (!schema) return;

    const parsed = schema.safeParse(envelope.data.payload);
    if (!parsed.success) return;

    this.listeners.get(eventType)?.forEach((handler) => handler(parsed.data));
  }
}

export const socketService = new SocketService();
