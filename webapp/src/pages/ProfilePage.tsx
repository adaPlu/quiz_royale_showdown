import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuthStore } from '@stores/authStore';
import { PlayerAvatar } from '@components/PlayerAvatar';
import { XpBar } from '@components/XpBar';
import { SeasonRankBadge } from '@components/SeasonRankBadge';
import { api } from '@services/apiClient';

interface DailyChallenge {
  id: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  completed: boolean;
  xpReward: number;
}

interface DailyChallengesResponse {
  challenges: DailyChallenge[];
}

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

  const [challenges, setChallenges] = useState<DailyChallenge[]>([]);
  const [challengesLoading, setChallengesLoading] = useState(false);

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

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setChallengesLoading(true);

    api.get<DailyChallengesResponse>('/challenges/daily')
      .then((res) => {
        if (!cancelled) setChallenges(res.data.challenges ?? []);
      })
      .catch(() => {
        if (!cancelled) setChallenges([]);
      })
      .finally(() => {
        if (!cancelled) setChallengesLoading(false);
      });

    return () => { cancelled = true; };
  }, [user]);

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

        <div className="w-full mt-2">
          <h2 className="text-white font-bold text-lg mb-3">Daily Challenges</h2>
          {challengesLoading && (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!challengesLoading && challenges.length === 0 && (
            <p className="text-game-muted text-sm text-center py-4">No daily challenges available.</p>
          )}
          {!challengesLoading && challenges.length > 0 && (
            <div className="space-y-3">
              {challenges.map((challenge) => {
                const progressPercent =
                  challenge.target > 0
                    ? Math.min(100, Math.round((challenge.progress / challenge.target) * 100))
                    : 100;
                return (
                  <div
                    key={challenge.id}
                    className={`bg-game-surface rounded-2xl p-4 border ${
                      challenge.completed ? 'border-answer-correct/40' : 'border-game-border'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {challenge.completed && (
                            <span className="text-answer-correct text-base">✓</span>
                          )}
                          <p className="text-white font-semibold text-sm">{challenge.title}</p>
                        </div>
                        <p className="text-game-muted text-xs mt-0.5">{challenge.description}</p>
                      </div>
                      <span className="shrink-0 text-xs font-bold text-gold border border-gold/30 rounded px-1.5 py-0.5">
                        +{challenge.xpReward} XP
                      </span>
                    </div>
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-game-muted mb-1">
                        <span>{challenge.progress} / {challenge.target}</span>
                        <span>{progressPercent}%</span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            challenge.completed ? 'bg-answer-correct' : 'bg-brand'
                          }`}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
