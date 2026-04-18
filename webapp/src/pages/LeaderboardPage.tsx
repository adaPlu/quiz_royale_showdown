import React, { useEffect, useState } from 'react';
import { api } from '@services/apiClient';
import { PlayerAvatar } from '@components/PlayerAvatar';
import { useAuthStore } from '@stores/authStore';

interface LeaderboardEntry {
  userId?: string;
  username: string;
  avatarUrl?: string;
  score?: number;
  points?: number;
}

export default function LeaderboardPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<'global' | 'season'>('global');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    api.get<LeaderboardEntry[]>(`/leaderboard?tab=${tab}&page=1`)
      .then((r) => setEntries(r.data))
      .catch(() => setEntries([]));
  }, [tab]);

  return (
    <div className="min-h-screen bg-game-bg p-4 max-w-lg mx-auto">
      <h1 className="text-white text-2xl font-black mb-4">🏆 Leaderboard</h1>
      <div className="flex gap-2 mb-4">
        {(['global', 'season'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-colors ${
              tab === t
                ? 'bg-brand text-white'
                : 'bg-game-surface text-game-muted border border-game-border'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {entries.length === 0 && (
          <p className="text-game-muted text-center py-8">No entries yet. Play a game!</p>
        )}
        {entries.map((e, i) => (
          <div
            key={e.userId ?? i}
            className={`flex items-center gap-3 p-3 rounded-xl border ${
              e.userId === user?.id
                ? 'bg-brand/10 border-brand/30'
                : 'bg-game-surface border-game-border'
            }`}
          >
            <span className="w-8 text-center font-bold text-game-muted">{i + 1}</span>
            <PlayerAvatar username={e.username} avatarUrl={e.avatarUrl} size="sm" />
            <span className="flex-1 text-white text-sm font-medium">{e.username}</span>
            <span className="text-white font-bold tabular-nums">
              {(e.score ?? e.points ?? 0).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
