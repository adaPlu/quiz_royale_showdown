import { io, type Socket } from 'socket.io-client';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Envelope schema (wraps every server → client message)
// ---------------------------------------------------------------------------
const EnvelopeSchema = z.object({
  eventType: z.string(),
  roomId: z.string(),
  senderId: z.string().optional(),
  ts: z.number(),
  payload: z.unknown(),
});

// ---------------------------------------------------------------------------
// Payload schemas for every server event
// ---------------------------------------------------------------------------
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

const PowerupUsedPayload = z.object({
  roomId: z.string(),
  playerId: z.string(),
  powerupId: z.string(),
});

const PowerupEffectPayload = z.object({
  roomId: z.string(),
  effectType: z.string(),
  affectedPlayerIds: z.array(z.string()),
  data: z.unknown().optional(),
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
  playerId: z.string(),
  newLevel: z.number(),
  xp: z.number(),
  xpToNextLevel: z.number(),
});

const ErrorPayload = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

// ---------------------------------------------------------------------------
// Server event discriminated union
// ---------------------------------------------------------------------------
export const ServerEventSchemas = {
  'room:state_sync': RoomStatePayload,
  'room:countdown_start': CountdownStartPayload,
  'round:question_started': QuestionPayload,
  'round:answer_locked': AnswerLockedPayload,
  'round:result': RoundResultPayload,
  'powerup:used': PowerupUsedPayload,
  'powerup:effect': PowerupEffectPayload,
  'game:over': GameOverPayload,
  'player:level_up': LevelUpPayload,
  'error': ErrorPayload,
} as const;

export type ServerEventType = keyof typeof ServerEventSchemas;
export type ServerEventPayload<E extends ServerEventType> = z.infer<typeof ServerEventSchemas[E]>;

// ---------------------------------------------------------------------------
// Client event types
// ---------------------------------------------------------------------------
export type ClientEventType =
  | 'room:join'
  | 'round:submit_answer'
  | 'powerup:activate'
  | 'client:heartbeat';

interface ClientEventPayloads {
  'room:join': { roomCode: string };
  'round:submit_answer': {
    roomId: string;
    questionId: string;
    answerIndex: number;
    clientSentAt: string;
  };
  'powerup:activate': { roomId: string; powerupId: string; targetPlayerId?: string };
  'client:heartbeat': { roomId: string; sentAt: string };
}

type Unsubscribe = () => void;

// ---------------------------------------------------------------------------
// SocketService class
// ---------------------------------------------------------------------------
class SocketService {
  private socket: Socket | null = null;
  private activeRoomId: string | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listeners = new Map<string, Set<(payload: any) => void>>();

  connect(accessToken: string): void {
    if (this.socket?.connected) return;

    const WS_URL =
      (import.meta as unknown as { env: Record<string, string> }).env?.VITE_WS_BASE_URL ??
      'http://localhost:4000';

    this.socket = io(WS_URL, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token: accessToken },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('message', (raw: unknown) => {
      const envelope = EnvelopeSchema.safeParse(raw);
      if (!envelope.success) return;

      const { eventType, payload } = envelope.data;
      const schema = ServerEventSchemas[eventType as ServerEventType];
      if (!schema) return;

      const parsed = schema.safeParse(payload);
      if (!parsed.success) return;

      const handlers = this.listeners.get(eventType);
      if (handlers) {
        handlers.forEach((h) => h(parsed.data));
      }
    });

    this.socket.on('connect', () => {
      if (this.activeRoomId) {
        this.emit('room:join', { roomCode: this.activeRoomId });
      }
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  setActiveRoom(roomId: string): void {
    this.activeRoomId = roomId;
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

  // ── Legacy compatibility shims ──────────────────────────────────────────────

  /** Legacy: send a raw event envelope. Used by GamePage.tsx. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send(envelope: { type: string; version: string; payload: Record<string, any> }): void {
    this.socket?.emit('message', envelope);
  }

  /**
   * Legacy: subscribe to ALL server events, calling `handler` with a
   * `{ type, version, payload }` object for each. Returns an unsubscribe fn.
   * Used by the original App.tsx socket wiring.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscribe(handler: (event: { type: string; version: string; payload: Record<string, any> }) => void): Unsubscribe {
    // Attach a listener on every known server event type and forward as legacy shape.
    const unsubs = (Object.keys(ServerEventSchemas) as ServerEventType[]).map((eventType) =>
      this.on(eventType, (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handler({ type: eventType, version: 'v1', payload: payload as Record<string, any> });
      }),
    );
    return () => unsubs.forEach((u) => u());
  }
}

export const socketService = new SocketService();
