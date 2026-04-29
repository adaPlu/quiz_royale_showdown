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

interface SeasonRankingEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  mmr: number;
  wins: number;
  gamesPlayed: number;
}

interface SeasonInfo {
  id: string;
  name: string;
  endsAt: string;
}

interface SeasonApiResponse {
  season: SeasonInfo | null;
  rankings: SeasonRankingEntry[];
}

interface FriendsRankingEntry {
  userId?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  score?: number;
  points?: number;
  rating?: number;
  mmr?: number;
  rank?: number;
}

interface FriendsApiResponse {
  entries?: FriendsRankingEntry[];
  rankings?: FriendsRankingEntry[];
  data?: FriendsRankingEntry[];
}

export default function LeaderboardPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<'global' | 'season' | 'friends' | 'in-game'>('global');

  // In-game leaderboard: players sorted by score from the active game session
  const inGamePlayers = useGameStore(selectLeaderboard);

  // Global leaderboard: fetched from REST API
  const [globalEntries, setGlobalEntries] = useState<GlobalLeaderboardEntry[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Season leaderboard
  const [seasonInfo, setSeasonInfo] = useState<SeasonInfo | null | undefined>(undefined);
  const [seasonEntries, setSeasonEntries] = useState<SeasonRankingEntry[]>([]);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [seasonError, setSeasonError] = useState<string | null>(null);

  // Friends leaderboard
  const [friendsEntries, setFriendsEntries] = useState<FriendsRankingEntry[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== 'global') return;

    let cancelled = false;
    setGlobalLoading(true);
    setGlobalError(null);

    api.get<LeaderboardApiResponse | GlobalLeaderboardEntry[]>('/leaderboard?limit=50')
      .then((res) => {
        if (cancelled) return;
        const raw = res.data;
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

  useEffect(() => {
    if (tab !== 'season') return;

    let cancelled = false;
    setSeasonLoading(true);
    setSeasonError(null);

    api.get<SeasonApiResponse>('/leaderboard/season')
      .then((res) => {
        if (cancelled) return;
        setSeasonInfo(res.data.season);
        setSeasonEntries(res.data.rankings ?? []);
      })
      .catch(() => {
        if (!cancelled) setSeasonError('Could not load season rankings. Try again later.');
      })
      .finally(() => {
        if (!cancelled) setSeasonLoading(false);
      });

    return () => { cancelled = true; };
  }, [tab]);

  useEffect(() => {
    if (tab !== 'friends') return;

    let cancelled = false;
    setFriendsLoading(true);
    setFriendsError(null);

    api.get<FriendsApiResponse | FriendsRankingEntry[]>('/leaderboard/friends')
      .then((res) => {
        if (cancelled) return;
        const raw = res.data;
        if (Array.isArray(raw)) {
          setFriendsEntries(raw);
        } else {
          const list = (raw as FriendsApiResponse).entries
            ?? (raw as FriendsApiResponse).rankings
            ?? (raw as FriendsApiResponse).data
            ?? [];
          setFriendsEntries(list);
        }
      })
      .catch(() => {
        if (!cancelled) setFriendsError('Could not load friends rankings. Try again later.');
      })
      .finally(() => {
        if (!cancelled) setFriendsLoading(false);
      });

    return () => { cancelled = true; };
  }, [tab]);

  const tabLabels: { key: typeof tab; label: string }[] = [
    { key: 'global', label: 'Global' },
    { key: 'season', label: 'Season' },
    { key: 'friends', label: 'Friends' },
    { key: 'in-game', label: 'In-Game' },
  ];

  return (
    <div className="min-h-screen bg-game-bg p-4 max-w-lg mx-auto">
      <h1 className="text-white text-2xl font-black mb-4">🏆 Leaderboard</h1>

      {/* Tab switcher */}
      <div role="tablist" className="flex gap-2 mb-4 flex-wrap">
        {tabLabels.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-colors ${
              tab === key
                ? 'bg-brand text-white'
                : 'bg-game-surface text-game-muted border border-game-border'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* In-game tab: real-time standings from gameStore */}
      {tab === 'in-game' && (
        <div role="rowgroup" className="space-y-2">
          {inGamePlayers.length === 0 && (
            <p className="text-game-muted text-center py-8">
              No active game session. Join a room to see the in-game leaderboard.
            </p>
          )}
          {inGamePlayers.map((player, i) => (
            <div
              key={player.id}
              role="row"
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
        <div role="rowgroup" className="space-y-2">
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
                role="row"
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

      {/* Season tab: fetched from /leaderboard/season */}
      {tab === 'season' && (
        <div role="rowgroup" className="space-y-2">
          {seasonLoading && (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!seasonLoading && seasonError && (
            <p className="text-answer-wrong text-center py-8">{seasonError}</p>
          )}
          {!seasonLoading && !seasonError && seasonInfo === null && (
            <p className="text-game-muted text-center py-8">No active season.</p>
          )}
          {!seasonLoading && !seasonError && seasonInfo != null && (
            <>
              <div className="bg-game-surface border border-game-border rounded-xl p-3 mb-3">
                <p className="text-white font-semibold">{seasonInfo.name}</p>
                <p className="text-game-muted text-xs mt-0.5">
                  Ends {new Date(seasonInfo.endsAt).toLocaleDateString()}
                </p>
              </div>
              {seasonEntries.length === 0 && (
                <p className="text-game-muted text-center py-8">
                  No season rankings available yet. Play games to appear here!
                </p>
              )}
              {seasonEntries.map((e, i) => (
                <div
                  key={e.userId ?? i}
                  role="row"
                  className={`flex items-center gap-3 p-3 rounded-xl border ${
                    e.userId === user?.id
                      ? 'bg-brand/10 border-brand/30'
                      : 'bg-game-surface border-game-border'
                  }`}
                >
                  <span className="w-8 text-center font-bold text-game-muted">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${e.rank}`}
                  </span>
                  <PlayerAvatar username={e.displayName} avatarUrl={e.avatarUrl} size="sm" />
                  <span className="flex-1 text-white text-sm font-medium">{e.displayName}</span>
                  <div className="text-right">
                    <div className="text-white font-bold tabular-nums">{e.mmr.toLocaleString()} MMR</div>
                    <div className="text-game-muted text-xs">{e.wins}W</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Friends tab: fetched from /leaderboard/friends */}
      {tab === 'friends' && (
        <div role="rowgroup" className="space-y-2">
          {friendsLoading && (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!friendsLoading && friendsError && (
            <p className="text-answer-wrong text-center py-8">{friendsError}</p>
          )}
          {!friendsLoading && !friendsError && friendsEntries.length === 0 && (
            <p className="text-game-muted text-center py-8">
              No friends rankings available yet. Add friends and play games to see them here!
            </p>
          )}
          {!friendsLoading && !friendsError && friendsEntries.map((e, i) => {
            const displayName = e.displayName ?? e.username ?? 'Unknown';
            const pts = e.mmr ?? e.score ?? e.points ?? e.rating ?? 0;
            return (
              <div
                key={e.userId ?? i}
                role="row"
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
