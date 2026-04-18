import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@services/apiClient';
import { useAuthStore } from '@stores/authStore';
import { PlayerAvatar } from '@components/PlayerAvatar';

export default function HomePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = (roomId: string) => navigate(`/lobby/${roomId}`);

  const quickPlay = async () => {
    setLoading('quick'); setError(null);
    try {
      const r = await api.post<{ roomId: string }>('/rooms/join', { roomCode: null });
      go(r.data.roomId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally { setLoading(null); }
  };

  const createRoom = async (isPrivate: boolean) => {
    setLoading(isPrivate ? 'private' : 'create'); setError(null);
    try {
      const r = await api.post<{ roomId: string }>('/rooms', { isPrivate, maxPlayers: 8 });
      go(r.data.roomId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally { setLoading(null); }
  };

  const joinByCode = async () => {
    if (code.length < 4) return;
    setLoading('join'); setError(null);
    try {
      const r = await api.post<{ roomId: string }>('/rooms/join', { roomCode: code.toUpperCase() });
      go(r.data.roomId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Room not found');
    } finally { setLoading(null); }
  };

  return (
    <div className="min-h-screen bg-game-bg flex flex-col">
      <header className="px-4 py-4 flex items-center justify-between border-b border-game-border">
        <div className="flex items-center gap-3">
          <PlayerAvatar username={user?.username ?? '?'} size="sm" />
          <div>
            <p className="text-white font-semibold text-sm">{user?.username}</p>
            <p className="text-game-muted text-xs">Level {user?.level ?? 1}</p>
          </div>
        </div>
        <button
          onClick={() => navigate(`/profile/${user?.username}`)}
          className="text-game-muted hover:text-white text-sm"
        >
          Profile
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center gap-4 px-4 max-w-sm mx-auto w-full">
        <h1 className="text-white text-3xl font-black text-center">Ready to Play?</h1>

        <button
          onClick={quickPlay}
          disabled={!!loading}
          className="w-full py-4 rounded-2xl bg-brand text-white font-bold text-lg shadow-royale hover:opacity-90 disabled:opacity-60"
        >
          {loading === 'quick' ? 'Finding game…' : '⚡ Quick Play'}
        </button>

        <button
          onClick={() => createRoom(true)}
          disabled={!!loading}
          className="w-full py-3 rounded-2xl bg-game-surface border border-game-border text-white font-semibold hover:border-brand/50 disabled:opacity-60"
        >
          {loading === 'private' ? 'Creating…' : '🔒 Create Private Room'}
        </button>

        <div className="w-full border-t border-game-border pt-4">
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))}
              placeholder="Room Code"
              className="flex-1 bg-game-card border border-game-border rounded-xl px-4 py-3 text-white placeholder-game-muted focus:outline-none focus:border-brand uppercase tracking-widest font-mono"
            />
            <button
              onClick={joinByCode}
              disabled={code.length < 4 || !!loading}
              className="px-4 py-3 rounded-xl bg-brand/20 border border-brand/40 text-brand font-semibold hover:bg-brand/30 disabled:opacity-40"
            >
              Join
            </button>
          </div>
        </div>

        {error && <p className="text-answer-wrong text-sm text-center">{error}</p>}

        <div className="flex gap-3 w-full pt-2">
          <button
            onClick={() => navigate('/leaderboard')}
            className="flex-1 py-2 rounded-xl border border-game-border text-game-muted text-sm hover:text-white hover:border-white/30"
          >
            🏆 Leaderboard
          </button>
        </div>
      </main>
    </div>
  );
}
