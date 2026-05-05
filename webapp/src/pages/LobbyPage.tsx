import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PlayerAvatar } from '@/components/PlayerAvatar';
import { useGameSocket } from '@/hooks/useGameSocket';
import { socketService } from '@/services/socketService';
import { useAuthStore } from '@/stores/authStore';
import { useGameStore } from '@/stores/gameStore';

export const LobbyPage = () => {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const user = useAuthStore((state) => state.user);
  const players = useGameStore((state) => state.players);
  const phase = useGameStore((state) => state.phase);
  const code = useGameStore((state) => state.code);
  const storedRoomId = useGameStore((state) => state.roomId);
  const [roomCode, setRoomCode] = useState((roomId ?? code ?? 'ROYALE').toUpperCase());

  useGameSocket(roomId ?? roomCode);

  const activeRoomId = useMemo(
    () => storedRoomId ?? code ?? roomId ?? roomCode,
    [code, roomCode, roomId, storedRoomId],
  );

  const joinRoom = () => {
    const normalizedCode = roomCode.trim().toUpperCase();
    if (!normalizedCode) return;

    socketService.setActiveRoom(normalizedCode, normalizedCode);
    socketService.emit('room:join', { roomCode: normalizedCode });
  };

  return (
    <main className="min-h-screen bg-game-gradient px-6 py-12 text-white">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[32px] border border-white/10 bg-white/5 p-8 shadow-royale backdrop-blur">
          <div className="mb-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/60 hover:border-white/30 hover:text-white"
            >
              ← Back
            </button>
          </div>
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
          </div>
        </section>

        <aside className="rounded-[32px] border border-white/10 bg-game-surface/85 p-6 backdrop-blur">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-white/50">Players</p>
              <h2 className="text-2xl font-black">{players.length} queued</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/game/${activeRoomId}`)}
              className="rounded-xl border border-gold/40 px-4 py-2 text-sm font-bold text-gold transition hover:bg-gold/10"
            >
              Enter Game
            </button>
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
