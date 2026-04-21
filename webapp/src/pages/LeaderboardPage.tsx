import { useEffect, useState } from 'react';

import { PlayerAvatar } from '@/components/PlayerAvatar';
import { api } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  mmr?: number;
  totalXp?: number;
  level?: number;
  wins?: number;
  gamesPlayed?: number;
}

type Tab = 'global' | 'season' | 'friends';

export default function LeaderboardPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('season');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const endpoint =
      tab === 'friends'
        ? '/leaderboard/friends?limit=50'
        : tab === 'season'
        ? '/leaderboard?season=current&limit=100'
        : '/leaderboard?limit=100';

    api
      .get<LeaderboardEntry[]>(endpoint)
      .then((r) => setEntries(r.data))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [tab]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'season', label: 'Season' },
    { id: 'global', label: 'Global' },
    { id: 'friends', label: 'Friends' },
  ];

  return (
    <div className="min-h-screen bg-[#0E0E1A] px-4 py-6 text-white">
      <div className="mx-auto max-w-lg">
        <h1 className="mb-6 text-2xl font-black">Leaderboard</h1>

        <div className="mb-5 flex gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                tab === t.id
                  ? 'bg-[#6C3EF5] text-white'
                  : 'border border-white/10 bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#6C3EF5] border-t-transparent" />
          </div>
        )}

        {!loading && entries.length === 0 && (
          <p className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-white/40">
            No entries yet. Play a game!
          </p>
        )}

        {!loading && (
          <div className="space-y-2">
            {entries.map((e) => (
              <div
                key={e.userId}
                className={`flex items-center gap-3 rounded-2xl border p-3 transition-colors ${
                  e.userId === user?.id
                    ? 'border-[#FFD700]/30 bg-[#FFD700]/5'
                    : 'border-white/10 bg-white/5'
                }`}
              >
                <span className="w-8 text-center text-sm font-bold text-white/40">
                  {e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : e.rank}
                </span>
                <PlayerAvatar player={{ id: e.userId, displayName: e.displayName, avatarUrl: e.avatarUrl, score: 0, streak: 0, isEliminated: false }} />
                <span className="flex-1 truncate text-sm font-medium">{e.displayName}</span>
                <span className="font-bold tabular-nums text-[#FFD700]">
                  {e.mmr ? `${e.mmr} MMR` : e.totalXp ? `${e.totalXp.toLocaleString()} XP` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
