import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PlayerAvatar } from '@/components/PlayerAvatar';
import { useGameSocket } from '@/hooks/useGameSocket';
import { api } from '@/services/apiClient';
import { socketService } from '@/services/socketService';
import { useAuthStore } from '@/stores/authStore';
import { useGameStore } from '@/stores/gameStore';

type RoomResponse = { room: { roomId: string; code: string } };

const STUCK_ROOM_PHRASES = ['already started', '2 player', 'in progress', 'no longer accepting', 'ROOM_IN_PROGRESS'];

export const LobbyPage = () => {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const user = useAuthStore((state) => state.user);
  const players = useGameStore((state) => state.players);
  const phase = useGameStore((state) => state.phase);
  const storedRoomId = useGameStore((state) => state.roomId);
  const hostUserId = useGameStore((state) => state.hostUserId);
  const resetRoom = useGameStore((state) => state.resetRoom);
  const [roomCode, setRoomCode] = useState((roomId ?? '').toUpperCase());
  const [startError, setStartError] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const recovering = useRef(false);

  useEffect(() => { resetRoom(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isHost = !hostUserId || (!!user && user.id === hostUserId);

  useGameSocket(roomId ?? roomCode);

  const activeRoomId = useMemo(
    () => storedRoomId ?? roomId ?? roomCode,
    [roomCode, roomId, storedRoomId],
  );

  const goToFreshRoom = async () => {
    if (recovering.current) return;
    recovering.current = true;
    setIsRecovering(true);
    try {
      const res = await api.post<RoomResponse>('/rooms/join', {});
      resetRoom();
      navigate(`/lobby/${res.data.room.code}`, { replace: true });
    } catch {
      setStartError('Could not create a new room — please go back to Home.');
      setIsRecovering(false);
      recovering.current = false;
    }
  };

  // Listen for backend socket errors; auto-recover from stuck rooms
  useEffect(() => {
    const socket = (socketService as unknown as { socket: { on: (e: string, cb: (msg: unknown) => void) => void; off: (e: string) => void } | null }).socket;
    if (!socket) return;
    const handler = (msg: unknown) => {
      const m = msg as { type?: string; payload?: { message?: string; code?: string } };
      if (m?.type !== 'error') return;
      const text = m.payload?.message ?? m.payload?.code ?? 'Unknown error';
      setStartError(text);
      if (STUCK_ROOM_PHRASES.some((phrase) => text.toLowerCase().includes(phrase.toLowerCase()))) {
        void goToFreshRoom();
      }
    };
    socket.on('message', handler);
    return () => socket.off('message');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startGame = () => {
    setStartError(null);
    const roomUuid = storedRoomId;
    if (!roomUuid) {
      setStartError('Room not synced yet — wait a moment and try again');
      return;
    }
    socketService.emit('room:start', { roomId: roomUuid });
  };

  const joinRoom = () => {
    const normalizedCode = roomCode.trim().toUpperCase();
    if (!normalizedCode) return;
    socketService.setActiveRoom(normalizedCode);
    socketService.emit('room:join', { roomCode: normalizedCode });
  };

  if (isRecovering) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-game-gradient text-white">
        <div className="text-center">
          <p className="text-lg font-semibold">Room was stuck — creating a fresh one...</p>
          <p className="mt-2 text-sm text-white/50">Redirecting you now</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-game-gradient px-6 py-12 text-white">
      <div className="mx-auto max-w-6xl">
        <button
          type="button"
          onClick={() => navigate('/home')}
          className="mb-6 flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
        >
          ← Back to Home
        </button>
      </div>
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[32px] border border-white/10 bg-white/5 p-8 shadow-royale backdrop-blur">
          <p className="mb-3 text-sm uppercase tracking-[0.3em] text-gold">Live Lobby</p>
          <h1 className="max-w-2xl text-4xl font-extrabold leading-tight md:text-5xl">
            Gather the room, sync the socket, then launch into the live quiz.
          </h1>
          <p className="mt-4 max-w-2xl text-white/70">
            Signed in as {user?.displayName ?? user?.username ?? 'player'}. Share the room code with
            challengers, then wait for the host to start the round loop.
          </p>

          <div className="mt-8 grid gap-4 rounded-[28px] border border-white/10 bg-black/20 p-5 md:grid-cols-[1fr_auto]">
            <label className="flex flex-col gap-3">
              <span className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">
                Room Code
              </span>
              <input
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value.toUpperCase().slice(0, 12))}
                className="rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-2xl font-bold tracking-[0.3em] outline-none transition focus:border-gold"
                maxLength={12}
              />
            </label>
            <button
              type="button"
              onClick={joinRoom}
              className="self-end rounded-2xl bg-brand px-7 py-4 text-lg font-semibold text-white shadow-brand transition hover:bg-brand/80"
            >
              Join Room
            </button>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-white/60">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              Phase: {phase}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              Room: {activeRoomId}
            </span>
            <button
              type="button"
              onClick={goToFreshRoom}
              className="rounded-full border border-white/20 bg-white/5 px-3 py-1 hover:bg-white/10 transition-colors"
            >
              New Room
            </button>
          </div>
        </section>

        <aside className="rounded-[32px] border border-white/10 bg-game-surface/85 p-6 backdrop-blur">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-white/50">Players</p>
              <h2 className="text-2xl font-black">{players.length} queued</h2>
            </div>
            {isHost ? (
              <div className="flex flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={startGame}
                  disabled={players.length === 0 || !storedRoomId}
                  className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white shadow-brand transition hover:bg-brand/80 disabled:opacity-40"
                >
                  Start Game
                </button>
                {startError && (
                  <p className="text-xs text-answer-wrong">{startError}</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-white/40">Waiting for host...</p>
            )}
          </div>

          <div className="space-y-3">
            {players.map((player) => (
              <PlayerAvatar key={player.id} player={player} />
            ))}
            {players.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/40">
                No players synced yet. Join the room to populate the lobby.
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
};
