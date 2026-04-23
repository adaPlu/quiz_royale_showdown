import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PlayerAvatar } from '@/components/PlayerAvatar';
import { SeasonRankBadge } from '@/components/SeasonRankBadge';
import { XpBar } from '@/components/XpBar';
import { useWebPush } from '@/hooks/useWebPush';
import { api } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

interface ProfileData {
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  seasonRank?: string;
  xp?: number;
  level?: number;
  gamesWon?: number;
  gamesPlayed?: number;
}

interface CosmeticItem {
  id: string;
  name: string;
  type: string;
  imageUrl?: string;
  isOwned: boolean;
  isEquipped: boolean;
}

const COSMETIC_EMOJI: Record<string, string> = {
  AVATAR_FRAME: '🖼️',
  CARD_BACK: '🃏',
  TITLE: '🏅',
  EMOTE: '🎭',
};

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const currentUser = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [cosmetics, setCosmetics] = useState<CosmeticItem[]>([]);
  const { pushState, subscribe, unsubscribe } = useWebPush();

  const isOwnProfile = !username || username === currentUser?.displayName;

  useEffect(() => {
    const endpoint = username ? `/users/${username}/profile` : '/users/me';
    api.get<ProfileData>(endpoint)
      .then((r) => setProfile(r.data))
      .catch(console.error);
  }, [username]);

  useEffect(() => {
    if (!isOwnProfile) return;
    api.get<CosmeticItem[]>('/cosmetics/owned')
      .then((r) => setCosmetics(r.data))
      .catch(() => setCosmetics([]));
  }, [isOwnProfile]);

  const equip = useCallback(async (cosmeticId: string) => {
    try {
      await api.post('/cosmetics/equip', { cosmeticId });
      setCosmetics((prev) => {
        const target = prev.find((c) => c.id === cosmeticId);
        if (!target) return prev;
        return prev.map((c) => ({
          ...c,
          isEquipped: c.type === target.type ? c.id === cosmeticId : c.isEquipped,
        }));
      });
    } catch { /* ignore */ }
  }, []);

  const displayName = profile?.displayName ?? profile?.username ?? 'Player';

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0E0E1A]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#6C3EF5] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0E0E1A] px-4 py-6 text-white">
      <div className="mx-auto max-w-lg">
        <button
          type="button"
          onClick={() => navigate('/home')}
          className="mb-4 flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
        >
          ← Back to Home
        </button>
        <div className="flex flex-col items-center gap-4 py-8">
          <PlayerAvatar
            player={{ id: currentUser?.id ?? '', displayName, avatarUrl: profile.avatarUrl, score: 0, streak: 0, isEliminated: false }}
          />
          <h1 className="text-2xl font-black">{displayName}</h1>
          <SeasonRankBadge rank={profile.seasonRank ?? 'Bronze'} />
          <div className="w-full">
            <XpBar current={profile.xp ?? 0} max={1000} level={profile.level ?? 1} animated />
          </div>

          <div className="grid w-full grid-cols-2 gap-3">
            <StatCard label="Wins" value={String(profile.gamesWon ?? 0)} />
            <StatCard label="Games" value={String(profile.gamesPlayed ?? 0)} />
          </div>
        </div>

        {isOwnProfile && cosmetics.length > 0 && (
          <section className="mb-8">
            <p className="mb-3 text-xs uppercase tracking-[0.3em] text-white/50">Your Cosmetics</p>
            <div className="grid grid-cols-4 gap-2">
              {cosmetics.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => equip(c.id)}
                  className={[
                    'flex flex-col items-center gap-1 rounded-2xl border p-3 text-center transition-all',
                    c.isEquipped
                      ? 'border-[#FFD700] bg-[#FFD700]/10'
                      : 'border-white/10 bg-white/5 hover:border-[#6C3EF5]/50',
                  ].join(' ')}
                >
                  <span className="text-2xl">{COSMETIC_EMOJI[c.type] ?? '✨'}</span>
                  <span className="text-[10px] font-medium leading-tight text-white/70">{c.name}</span>
                  {c.isEquipped && <span className="text-[9px] font-bold text-[#FFD700]">On</span>}
                </button>
              ))}
            </div>
          </section>
        )}

        {isOwnProfile && pushState !== 'unsupported' && (
          <section className="rounded-[20px] border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Game notifications</p>
                <p className="text-xs text-white/40">Get alerted when your game starts</p>
              </div>
              {pushState === 'subscribed' ? (
                <button
                  type="button"
                  onClick={unsubscribe}
                  className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold transition hover:bg-white/20"
                >
                  Turn off
                </button>
              ) : (
                <button
                  type="button"
                  onClick={subscribe}
                  disabled={pushState === 'denied'}
                  className="rounded-xl bg-[#6C3EF5] px-3 py-2 text-xs font-bold transition hover:bg-[#5a32d4] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pushState === 'denied' ? 'Blocked' : 'Enable'}
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
      <p className="text-2xl font-black">{value}</p>
      <p className="text-xs text-white/50">{label}</p>
    </div>
  );
}
