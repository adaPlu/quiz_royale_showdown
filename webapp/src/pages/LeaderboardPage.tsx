import React, { useEffect, useState } from 'react';
import { PlayerAvatar } from '@components/PlayerAvatar';
import { useAuthStore } from '@stores/authStore';
import { selectLeaderboard, useGameStore } from '@stores/gameStore';
import { api } from '@services/apiClient';

interface GlobalLeaderboardEntry {
  userId?: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  score?: number;
  points?: number;
  rating?: number;
}

interface LeaderboardApiResponse {
  entries?: GlobalLeaderboardEntry[];
  rankings?: GlobalLeaderboardEntry[];
  data?: GlobalLeaderboardEntry[];
}

export default function LeaderboardPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<'global' | 'in-game'>('global');

  // In-game leaderboard: players sorted by score from the active game session
  const inGamePlayers = useGameStore(selectLeaderboard);

  // Global leaderboard: fetched from REST API
  const [globalEntries, setGlobalEntries] = useState<GlobalLeaderboardEntry[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== 'global') return;

    let cancelled = false;
    setGlobalLoading(true);
    setGlobalError(null);

    api.get<LeaderboardApiResponse | GlobalLeaderboardEntry[]>('/leaderboard?limit=50')
      .then((res) => {
        if (cancelled) return;
        const raw = res.data;
        // Handle both array and object response shapes
        if (Array.isArray(raw)) {
          setGlobalEntries(raw);
        } else {
          const list = (raw as LeaderboardApiResponse).entries
            ?? (raw as LeaderboardApiResponse).rankings
            ?? (raw as LeaderboardApiResponse).data
            ?? [];
          setGlobalEntries(list);
        }
      })
      .catch(() => {
        if (!cancelled) setGlobalError('Could not load global rankings. Try again later.');
      })
      .finally(() => {
        if (!cancelled) setGlobalLoading(false);
      });

    return () => { cancelled = true; };
  }, [tab]);

  return (
    <div className="min-h-screen bg-game-bg p-4 max-w-lg mx-auto">
      <h1 className="text-white text-2xl font-black mb-4">🏆 Leaderboard</h1>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-4">
        {(['global', 'in-game'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-colors ${
              tab === t
                ? 'bg-brand text-white'
                : 'bg-game-surface text-game-muted border border-game-border'
            }`}
          >
            {t === 'in-game' ? 'In-Game' : 'Global'}
          </button>
        ))}
      </div>

      {/* In-game tab: real-time standings from gameStore */}
      {tab === 'in-game' && (
        <div className="space-y-2">
          {inGamePlayers.length === 0 && (
            <p className="text-game-muted text-center py-8">
              No active game session. Join a room to see the in-game leaderboard.
            </p>
          )}
          {inGamePlayers.map((player, i) => (
            <div
              key={player.id}
              className={`flex items-center gap-3 p-3 rounded-xl border ${
                player.id === user?.id
                  ? 'bg-brand/10 border-brand/30'
                  : player.isEliminated
                  ? 'bg-game-surface border-game-border opacity-40'
                  : 'bg-game-surface border-game-border'
              }`}
            >
              <span className="w-8 text-center font-bold text-game-muted">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
              </span>
              <PlayerAvatar player={player} />
              <span className="flex-1 text-white text-sm font-medium truncate">
                {player.displayName}
                {player.id === user?.id ? ' (you)' : ''}
                {player.isEliminated ? ' 💀' : ''}
              </span>
              <span className="text-white font-bold tabular-nums">
                {player.score.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Global tab: fetched from REST API */}
      {tab === 'global' && (
        <div className="space-y-2">
          {globalLoading && (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!globalLoading && globalError && (
            <p className="text-answer-wrong text-center py-8">{globalError}</p>
          )}
          {!globalLoading && !globalError && globalEntries.length === 0 && (
            <p className="text-game-muted text-center py-8">
              No global rankings available yet. Play games to appear here!
            </p>
          )}
          {!globalLoading && !globalError && globalEntries.map((e, i) => {
            const displayName = e.displayName ?? e.username;
            const pts = e.score ?? e.points ?? e.rating ?? 0;
            return (
              <div
                key={e.userId ?? i}
                className={`flex items-center gap-3 p-3 rounded-xl border ${
                  e.userId === user?.id
                    ? 'bg-brand/10 border-brand/30'
                    : 'bg-game-surface border-game-border'
                }`}
              >
                <span className="w-8 text-center font-bold text-game-muted">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                </span>
                <PlayerAvatar username={displayName} avatarUrl={e.avatarUrl} size="sm" />
                <span className="flex-1 text-white text-sm font-medium">{displayName}</span>
                <span className="text-white font-bold tabular-nums">
                  {pts.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
