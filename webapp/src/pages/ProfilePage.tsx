import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuthStore } from '@stores/authStore';
import { PlayerAvatar } from '@components/PlayerAvatar';
import { XpBar } from '@components/XpBar';
import { SeasonRankBadge } from '@components/SeasonRankBadge';
import { api } from '@services/apiClient';

interface MeResponse {
  id: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  rating?: number;
  level?: number;
  xp?: number;
  xpToNextLevel?: number;
  seasonRank?: string;
  gamesWon?: number;
  gamesPlayed?: number;
}

interface ProfileData {
  username: string;
  avatarUrl?: string;
  seasonRank: string;
  xp: number;
  xpToNextLevel: number;
  level: number;
  gamesWon: number;
  gamesPlayed: number;
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const user = useAuthStore((s) => s.user);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchProfile() {
      try {
        const res = await api.get<MeResponse>('/users/me');
        const data = res.data;

        if (!cancelled) {
          setProfile({
            username: username ?? data.displayName ?? data.username ?? user?.displayName ?? 'Player',
            avatarUrl: data.avatarUrl ?? user?.avatarUrl,
            seasonRank: data.seasonRank ?? 'Bronze',
            xp: data.xp ?? user?.xp ?? 0,
            xpToNextLevel: data.xpToNextLevel ?? 1000,
            level: data.level ?? user?.level ?? 1,
            gamesWon: data.gamesWon ?? 0,
            gamesPlayed: data.gamesPlayed ?? 0,
          });
        }
      } catch {
        // Fall back to auth store values on error
        if (!cancelled) {
          setProfile({
            username: username ?? user?.displayName ?? 'Player',
            avatarUrl: user?.avatarUrl,
            seasonRank: 'Bronze',
            xp: user?.xp ?? 0,
            xpToNextLevel: 1000,
            level: user?.level ?? 1,
            gamesWon: 0,
            gamesPlayed: 0,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (user) {
      fetchProfile();
    } else {
      setLoading(false);
    }

    return () => { cancelled = true; };
  }, [user, username]);

  if (!user || loading) {
    return (
      <div className="min-h-screen bg-game-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-game-bg p-4 max-w-lg mx-auto">
      <div className="flex flex-col items-center gap-4 py-8">
        <PlayerAvatar username={profile.username} avatarUrl={profile.avatarUrl} size="xl" showTitle />
        <h1 className="text-white text-2xl font-black">{profile.username}</h1>
        <SeasonRankBadge rank={profile.seasonRank} />
        <XpBar current={profile.xp} max={profile.xpToNextLevel} level={profile.level} animated />
        <div className="grid grid-cols-2 gap-3 w-full mt-2">
          <div className="bg-game-surface rounded-2xl p-4 text-center border border-game-border">
            <p className="text-2xl font-black text-white">{profile.gamesWon}</p>
            <p className="text-game-muted text-xs">Wins</p>
          </div>
          <div className="bg-game-surface rounded-2xl p-4 text-center border border-game-border">
            <p className="text-2xl font-black text-white">{profile.gamesPlayed}</p>
            <p className="text-game-muted text-xs">Games</p>
          </div>
        </div>
      </div>
    </div>
  );
}
