import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PlayerAvatar } from '@/components/PlayerAvatar';
import { useGameSocket } from '@/hooks/useGameSocket';
import { useMountedRef } from '@/hooks/useMountedRef';
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

export const LobbyPage = () => {
  const navigate = useNavigate();
  const mountedRef = useMountedRef();
  const { roomId } = useParams<{ roomId: string }>();
  const accessToken = useAuthStore((state) => state.accessToken);

  useGameSocket(roomId);

  const code = useGameStore((state) => state.code);
  const phase = useGameStore((state) => state.phase);
  const players = useGameStore(selectLeaderboard);
  const totalRounds = useGameStore((state) => state.totalRounds);
  const roundNumber = useGameStore((state) => state.roundNumber);

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
  const [startError, setStartError] = useState<string | null>(null);
  const hasMinimumPlayers = players.length >= 2;

  useEffect(() => {
    return socketService.on('error', (payload) => {
      if (payload.code === 'GAME_START_FAILED') {
        setIsStarting(false);
        setStartError(payload.message);
      }
    });
  }, []);

  const handleStartGame = async () => {
    if (!roomId) return;

    if (!hasMinimumPlayers) {
      setStartError('At least 2 players are required to start.');
      return;
    }

    setIsStarting(true);
    setStartError(null);
    try {
      await api.post(`/rooms/${roomId}/start`);
      // Navigation happens automatically via the round:countdown_started socket event
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const message =
        err instanceof ApiError && err.message
          ? err.message
          : err instanceof Error && err.message
            ? err.message
            : 'Failed to start game';
      setStartError(message);
    } finally {
      if (mountedRef.current) setIsStarting(false);
    }
  };

  const displayCode = code ?? socketService.getActiveRoom()?.roomCode ?? '----';
  const canRecoverSession = !!displayCode && displayCode !== '----';

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
              onClick={() => navigate('/home')}
              className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-white/80 transition hover:border-white/30 hover:text-white"
            >
              Back to Home
            </button>
          </div>
        </section>

        {!canRecoverSession && (
          <section className="rounded-[28px] border border-amber-400/30 bg-amber-500/10 p-6 text-sm text-amber-100">
            This lobby needs a room code from the create/join flow. Reload recovery by room id alone still depends on backend exposing room lookup by id or returning room code on every room entry response.
          </section>
        )}

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
              <PlayerAvatar key={player.id} player={player} />
            ))}
            {players.length === 0 && (
              <div className="rounded-3xl border border-dashed border-white/10 p-6 text-white/50">
                Waiting for room state...
              </div>
            )}
          </div>

          {phase === 'WAITING' && (
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                disabled={isStarting || !hasMinimumPlayers}
                onClick={() => void handleStartGame()}
                className="w-full rounded-2xl bg-brand py-4 text-base font-black uppercase tracking-widest text-white shadow-royale transition hover:opacity-90 disabled:opacity-40"
              >
                {isStarting ? 'Starting...' : 'Start Game'}
              </button>
              {startError && (
                <p className="text-center text-sm text-answer-wrong">{startError}</p>
              )}
              {!hasMinimumPlayers && (
                <p className="text-center text-xs text-white/40">
                  At least 2 players are required to start.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
};
