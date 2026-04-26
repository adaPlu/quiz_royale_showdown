import React from 'react';
import { useParams } from 'react-router-dom';
import { useAuthStore } from '@stores/authStore';
import { PlayerAvatar } from '@components/PlayerAvatar';
import { XpBar } from '@components/XpBar';
import { SeasonRankBadge } from '@components/SeasonRankBadge';

interface ProfileData {
  username: string;
  avatarUrl?: string;
  seasonRank?: string;
  xp?: number;
  level?: number;
  gamesWon?: number;
  gamesPlayed?: number;
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const user = useAuthStore((s) => s.user);

  if (!user) {
    return (
      <div className="min-h-screen bg-game-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const profile: ProfileData = {
    username: username ?? user.displayName,
    avatarUrl: user.avatarUrl,
    seasonRank: 'Bronze',
    xp: 0,
    level: 1,
    gamesWon: 0,
    gamesPlayed: 0,
  };

  return (
    <div className="min-h-screen bg-game-bg p-4 max-w-lg mx-auto">
      <div className="flex flex-col items-center gap-4 py-8">
        <PlayerAvatar username={profile.username} avatarUrl={profile.avatarUrl} size="xl" showTitle />
        <h1 className="text-white text-2xl font-black">{profile.username}</h1>
        <SeasonRankBadge rank={profile.seasonRank ?? 'Bronze'} />
        <XpBar current={profile.xp ?? 0} max={1000} level={profile.level ?? 1} animated />
        <div className="grid grid-cols-2 gap-3 w-full mt-2">
          <div className="bg-game-surface rounded-2xl p-4 text-center border border-game-border">
            <p className="text-2xl font-black text-white">{profile.gamesWon ?? 0}</p>
            <p className="text-game-muted text-xs">Wins</p>
          </div>
          <div className="bg-game-surface rounded-2xl p-4 text-center border border-game-border">
            <p className="text-2xl font-black text-white">{profile.gamesPlayed ?? 0}</p>
            <p className="text-game-muted text-xs">Games</p>
          </div>
        </div>
      </div>
    </div>
  );
}
