import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { PlayerAvatar } from '@components/PlayerAvatar';
import { api } from '@services/apiClient';
import { useAuthStore } from '@stores/authStore';

type RoomResponse = {
  room: {
    roomId: string;
    code: string;
  };
};

export default function HomePage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  const handleLogout = () => {
    clearAuth();
    navigate('/login', { replace: true });
  };
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [isJoining, setIsJoining] = useState(false);

  const goToLobby = async (roomCode: string) => {
    const normalizedCode = roomCode.trim().toUpperCase();
    if (normalizedCode.length < 4) {
      setError('Enter at least 4 characters for a room code.');
      return;
    }

    setIsJoining(true);
    try {
      const response = await api.post<RoomResponse>('/rooms/join', { roomCode: normalizedCode });
      navigate(`/lobby/${response.data.room.code}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to join that room.');
    } finally {
      setIsJoining(false);
    }
  };

  const quickPlay = async () => {
    setError(null);
    setIsJoining(true);
    try {
      const response = await api.post<RoomResponse>('/rooms/join', {});
      navigate(`/lobby/${response.data.room.code}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to find a match.');
    } finally {
      setIsJoining(false);
    }
  };

  const createPrivateRoom = async () => {
    setError(null);
    setIsJoining(true);
    try {
      const response = await api.post<RoomResponse>('/rooms', { isPrivate: true });
      navigate(`/lobby/${response.data.room.code}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to create a private room.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-game-bg">
      <header className="flex items-center justify-between border-b border-game-border px-4 py-4">
        <div className="flex items-center gap-3">
          <PlayerAvatar username={user?.username ?? user?.displayName ?? '?'} size="sm" />
          <div>
            <p className="text-sm font-semibold text-white">{user?.displayName ?? user?.username}</p>
            <p className="text-xs text-game-muted">Level {user?.level ?? 1}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/profile/${user?.username ?? user?.displayName ?? 'me'}`)}
            className="text-sm text-game-muted hover:text-white"
          >
            Profile
          </button>
          <button
            onClick={handleLogout}
            className="text-sm text-game-muted hover:text-answer-wrong"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-4">
        <h1 className="text-center text-3xl font-black text-white">Ready to Play?</h1>

        <button
          onClick={quickPlay}
          disabled={isJoining}
          className="w-full rounded-2xl bg-brand py-4 text-lg font-bold text-white shadow-royale hover:opacity-90"
        >
          Quick Play
        </button>

        <button
          onClick={createPrivateRoom}
          disabled={isJoining}
          className="w-full rounded-2xl border border-game-border bg-game-surface py-3 font-semibold text-white hover:border-brand/50"
        >
          Create Private Room
        </button>

        <div className="w-full border-t border-game-border pt-4">
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(event) => {
                setError(null);
                setCode(event.target.value.toUpperCase().slice(0, 12));
              }}
              placeholder="Room Code"
              className="flex-1 rounded-xl border border-game-border bg-game-card px-4 py-3 font-mono uppercase tracking-widest text-white placeholder-game-muted focus:border-brand focus:outline-none"
            />
            <button
              onClick={() => goToLobby(code)}
              disabled={code.length < 4 || isJoining}
              className="rounded-xl border border-brand/40 bg-brand/20 px-4 py-3 font-semibold text-brand hover:bg-brand/30 disabled:opacity-40"
            >
              Join
            </button>
          </div>
        </div>

        {error && <p className="text-center text-sm text-answer-wrong">{error}</p>}

        <button
          onClick={() => navigate('/leaderboard')}
          className="w-full rounded-xl border border-game-border py-2 text-sm text-game-muted hover:border-white/30 hover:text-white"
        >
          Leaderboard
        </button>
      </main>
    </div>
  );
}
