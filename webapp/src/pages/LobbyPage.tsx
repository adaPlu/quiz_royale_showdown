import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from '../navigation';

import { PlayerAvatar } from '@/components/PlayerAvatar';
import { useGameSocket } from '@/hooks/useGameSocket';
import { useMountedRef } from '@/hooks/useMountedRef';
import type { ServerEventPayload } from '@/lib/contracts';
import { ApiError, api } from '@/services/apiClient';
import { socketService } from '@/services/socketService';
import { useAuthStore } from '@/stores/authStore';
import { selectLeaderboard, useGameStore } from '@/stores/gameStore';

const phaseCopy: Record<string, string> = {
  WAITING: 'Waiting for players',
  COUNTDOWN: 'Countdown started',
  QUESTION_ACTIVE: 'Round in progress',
  ANSWER_LOCKED: 'Answers locked',
  ROUND_RESULT: 'Round result',
  ELIMINATION: 'Elimination round',
  FINALE: 'Finale',
  GAME_OVER: 'Game over',
};

type GameDifficulty = 'easy' | 'medium' | 'hard';
type RoomSnapshot = ServerEventPayload<'room:state_sync'>['room'];
type RoomStateResponse = {
  room: RoomSnapshot;
  config: { difficulty: GameDifficulty };
};

const difficultyOptions: Array<{
  value: GameDifficulty;
  label: string;
  description: string;
}> = [
  {
    value: 'easy',
    label: 'Easy',
    description: 'Easy questions only.',
  },
  {
    value: 'medium',
    label: 'Medium',
    description: 'A shuffled mix of easy and medium questions.',
  },
  {
    value: 'hard',
    label: 'Hard',
    description: 'A shuffled mix of medium and hard questions.',
  },
];

export const LobbyPage = () => {
  const navigate = useNavigate();
  const mountedRef = useMountedRef();
  const { roomId } = useParams<{ roomId: string }>();
  const accessToken = useAuthStore((state) => state.accessToken);
  const userId = useAuthStore((state) => state.user?.id ?? null);

  useGameSocket(roomId);

  const code = useGameStore((state) => state.code);
  const hostUserId = useGameStore((state) => state.hostUserId);
  const phase = useGameStore((state) => state.phase);
  const players = useGameStore(selectLeaderboard);
  const totalRounds = useGameStore((state) => state.totalRounds);
  const roundNumber = useGameStore((state) => state.roundNumber);
  const applyRoomState = useGameStore((state) => state.applyRoomState);
  const resetRoom = useGameStore((state) => state.resetRoom);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const activeRoom = socketService.getActiveRoom();
    const token = activeRoom?.token ?? accessToken;
    const roomCode = activeRoom?.roomCode ?? code;

    if (!token || !roomCode) {
      return;
    }

    socketService.connect(token);
    socketService.setActiveRoom({ roomId, roomCode, token });
    socketService.joinRoom(roomCode, roomId);
  }, [accessToken, code, roomId]);

  const [isStarting, setIsStarting] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isSavingDifficulty, setIsSavingDifficulty] = useState(false);
  const [difficulty, setDifficulty] = useState<GameDifficulty>('medium');
  const [startError, setStartError] = useState<string | null>(null);
  const [startNotice, setStartNotice] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const hasMultiplePlayers = players.length >= 2;
  const isHost = Boolean(userId && hostUserId === userId);
  const hostPlayer = players.find((player) => player.id === hostUserId);
  const hostName = hostPlayer?.displayName ?? 'the room host';
  const selectedDifficulty = difficultyOptions.find((option) => option.value === difficulty)!;

  useEffect(() => {
    if (!roomId) {
      return;
    }

    let cancelled = false;

    void api
      .get<RoomStateResponse>(`/rooms/by-id/${roomId}`)
      .then((response) => {
        if (!cancelled && mountedRef.current) {
          applyRoomState({ room: response.data.room });
          setDifficulty(response.data.config.difficulty);
          socketService.updateRoomSnapshot(
            response.data.room.roomId,
            response.data.room.code,
          );
        }
      })
      .catch((error: unknown) => {
        if (!cancelled && mountedRef.current) {
          setStartError(
            error instanceof Error && error.message
              ? error.message
              : 'Unable to load the current lobby state',
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [applyRoomState, mountedRef, roomId]);

  useEffect(() => {
    return socketService.on('error', (payload) => {
      if (payload.code === 'GAME_START_FAILED') {
        setIsStarting(false);
        setStartNotice(null);
        setStartError(payload.message);
      }
    });
  }, []);

  const displayCode = code ?? socketService.getActiveRoom()?.roomCode ?? '----';
  const canRecoverSession = !!displayCode && displayCode !== '----';

  const buildInviteUrl = () => {
    const origin = window.location.origin;
    return `${origin}/login?roomCode=${encodeURIComponent(displayCode)}`;
  };

  const buildInviteMessage = () =>
    `Join my Quiz Royale room. Use room code ${displayCode} or open ${buildInviteUrl()}`;

  const copyInvite = async (targetLabel = 'Invite') => {
    setInviteError(null);
    setInviteNotice(null);

    if (!canRecoverSession) {
      setInviteError('Room code is still syncing. Try again in a moment.');
      return;
    }

    try {
      await navigator.clipboard.writeText(buildInviteMessage());
      setInviteNotice(`${targetLabel} copied to clipboard.`);
    } catch {
      setInviteError(`Copy failed. Share room code ${displayCode} manually.`);
    }
  };

  const emailInvite = () => {
    setInviteError(null);
    setInviteNotice(null);

    if (!canRecoverSession) {
      setInviteError('Room code is still syncing. Try again in a moment.');
      return;
    }

    const recipient = email.trim();
    const href =
      `mailto:${encodeURIComponent(recipient)}` +
      `?subject=${encodeURIComponent('Join my Quiz Royale room')}` +
      `&body=${encodeURIComponent(buildInviteMessage())}`;

    window.location.href = href;
    setInviteNotice('Email invite opened.');
  };

  const handleDifficultyChange = async (nextDifficulty: GameDifficulty) => {
    if (!roomId || !isHost || phase !== 'WAITING' || nextDifficulty === difficulty) {
      return;
    }

    setIsSavingDifficulty(true);
    setStartError(null);

    try {
      const response = await api.patch<{ difficulty: GameDifficulty }>(
        `/rooms/by-id/${roomId}/difficulty`,
        { difficulty: nextDifficulty },
      );
      if (mountedRef.current) {
        setDifficulty(response.data.difficulty);
      }
    } catch (error: unknown) {
      if (!mountedRef.current) return;
      setStartError(
        error instanceof Error && error.message
          ? error.message
          : 'Failed to update game difficulty',
      );
    } finally {
      if (mountedRef.current) {
        setIsSavingDifficulty(false);
      }
    }
  };

  const handleStartGame = useCallback(async () => {
    if (!roomId || !isHost) return;

    setIsStarting(true);
    setStartError(null);
    setStartNotice(
      hasMultiplePlayers
        ? `Starting a ${difficulty} multiplayer game...`
        : `Starting a ${difficulty} solo game...`,
    );

    try {
      await api.post(`/rooms/${roomId}/start`, { allowSolo: !hasMultiplePlayers });
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const message =
        err instanceof ApiError && err.message
          ? err.message
          : err instanceof Error && err.message
            ? err.message
            : 'Failed to start game';
      setStartError(message);
      setStartNotice(null);
    } finally {
      if (mountedRef.current) setIsStarting(false);
    }
  }, [difficulty, hasMultiplePlayers, isHost, mountedRef, roomId]);

  const handleLeaveLobby = async () => {
    if (isLeaving) return;

    setIsLeaving(true);
    setStartError(null);

    try {
      if (roomId) {
        await api.post(`/rooms/${roomId}/leave`);
      }
    } catch {
      // Returning home should not strand the client in a stale room if leave fails.
    } finally {
      socketService.disconnect(true);
      resetRoom();
      if (mountedRef.current) {
        navigate('/home', { replace: true });
      }
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(108,62,245,0.35),_transparent_45%),linear-gradient(180deg,_#111122,_#090910)] px-6 py-12 text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <section className="rounded-[32px] border border-white/10 bg-white/5 p-8 shadow-royale backdrop-blur">
          <p className="mb-3 text-sm uppercase tracking-[0.3em] text-brand-gold">Room Lobby</p>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-4xl font-extrabold leading-tight">Code {displayCode}</h1>
              <p className="mt-3 max-w-2xl text-white/70">
                {phaseCopy[phase] ?? 'Syncing room state'}.
                {' '}
                Round {roundNumber} of {totalRounds}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleLeaveLobby()}
              disabled={isLeaving}
              className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-white/80 transition hover:border-white/30 hover:text-white"
            >
              {isLeaving ? 'Leaving...' : 'Back to Home'}
            </button>
          </div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-brand-panel/80 p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">Players</p>
              <p className="mt-2 text-white/70">{players.length} connected</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right">
              <p className="text-xs uppercase tracking-[0.2em] text-white/50">Status</p>
              <p className="mt-1 text-lg font-bold">{phaseCopy[phase] ?? phase}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {players.map((player) => (
              <div key={player.id} className="relative">
                {player.id === hostUserId && (
                  <span className="absolute right-3 top-3 z-10 rounded-full bg-brand-gold px-3 py-1 text-[10px] font-black uppercase tracking-widest text-black">
                    Host
                  </span>
                )}
                <PlayerAvatar player={player} />
              </div>
            ))}
            {players.length === 0 && (
              <div className="rounded-3xl border border-dashed border-white/10 p-6 text-white/50">
                Waiting for room state...
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">
                  Game Controls
                </p>
                <span className="rounded-full border border-brand-gold/40 bg-brand-gold/10 px-3 py-1 text-xs font-bold text-brand-gold">
                  {isHost ? 'You are Host' : `${hostName} is Host`}
                </span>
              </div>

              {phase === 'WAITING' && (
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-white">Question Difficulty</p>
                    {isSavingDifficulty && (
                      <span className="text-xs text-brand-gold">Saving...</span>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {difficultyOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        disabled={!isHost || isSavingDifficulty || isStarting}
                        onClick={() => void handleDifficultyChange(option.value)}
                        className={`rounded-xl border px-3 py-3 text-sm font-bold transition ${
                          difficulty === option.value
                            ? 'border-brand-gold bg-brand-gold text-black'
                            : 'border-white/10 bg-black/20 text-white hover:border-white/30'
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-white/65">
                    {selectedDifficulty.description}
                    {!isHost ? ` ${hostName} controls this setting.` : ''}
                  </p>
                </div>
              )}

              {isHost ? (
                phase === 'WAITING' ? (
                  <>
                    <p className="mt-4 text-lg font-bold text-white">
                      {hasMultiplePlayers ? 'Multiplayer Mode' : 'Single Player Mode'}
                    </p>
                    <p className="mt-2 text-sm text-white/70">
                      {hasMultiplePlayers
                        ? `${players.length} players are connected. Start a ${difficulty} game when ready.`
                        : `Play all ten trivia rounds by yourself on ${difficulty} difficulty.`}
                    </p>
                    <button
                      type="button"
                      disabled={isStarting || isSavingDifficulty}
                      onClick={() => void handleStartGame()}
                      className="mt-5 w-full rounded-2xl bg-brand-gold px-4 py-4 text-sm font-black uppercase tracking-widest text-black shadow-royale transition hover:opacity-90 disabled:opacity-40"
                    >
                      {isStarting
                        ? 'Starting...'
                        : hasMultiplePlayers
                          ? 'Start Multiplayer'
                          : 'Play Solo'}
                    </button>
                  </>
                ) : (
                  <p className="mt-4 text-sm text-white/70">
                    {phaseCopy[phase] ?? phase}. Game controls will return if startup fails.
                  </p>
                )
              ) : (
                <>
                  <p className="mt-4 text-lg font-bold text-white">Waiting for the host</p>
                  <p className="mt-2 text-sm text-white/70">
                    {hostName} can start the game. Host-only controls are hidden from other players.
                  </p>
                </>
              )}

              {startNotice && <p className="mt-3 text-sm text-brand-gold">{startNotice}</p>}
              {startError && <p className="mt-3 text-sm text-answer-wrong">{startError}</p>}
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">
                Invite Players
              </p>
              <p className="mt-3 text-sm text-white/70">
                Share code <span className="font-mono font-bold text-white">{displayCode}</span> or send a guest-ready link.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={!canRecoverSession}
                  onClick={() => void copyInvite()}
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/30 disabled:opacity-40"
                >
                  Copy Invite
                </button>
                <button
                  type="button"
                  disabled={!canRecoverSession}
                  onClick={() => void copyInvite('Friends invite')}
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/30 disabled:opacity-40"
                >
                  Copy for Friends
                </button>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  placeholder="friend@email.com"
                  className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white placeholder-white/35 outline-none transition focus:border-brand"
                />
                <button
                  type="button"
                  disabled={!canRecoverSession}
                  onClick={emailInvite}
                  className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black transition hover:opacity-90 disabled:opacity-40"
                >
                  Email Invite
                </button>
              </div>

              {inviteNotice && <p className="mt-3 text-sm text-brand-gold">{inviteNotice}</p>}
              {inviteError && <p className="mt-3 text-sm text-answer-wrong">{inviteError}</p>}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};
