import React from 'react';
import type { PlayerSummary } from '@/types/game';

// ── Legacy shape used by GamePage / LobbyPage ──────────────────────────────
type LegacyProps = {
  player: PlayerSummary;
  size?: never;
  username?: never;
  avatarUrl?: never;
  showTitle?: never;
};

// ── New shape used by HomePage, ResultsPage, ProfilePage, etc. ─────────────
type NewProps = {
  player?: never;
  username: string;
  avatarUrl?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showTitle?: boolean;
};

type PlayerAvatarProps = LegacyProps | NewProps;

const SIZE_CLASSES: Record<string, string> = {
  xs: 'h-7 w-7 text-xs',
  sm: 'h-9 w-9 text-sm',
  md: 'h-12 w-12 text-base',
  lg: 'h-16 w-16 text-lg',
  xl: 'h-20 w-20 text-xl',
};

export const PlayerAvatar = (props: PlayerAvatarProps) => {
  // ── New API ──
  if ('username' in props && props.username !== undefined) {
    const { username, avatarUrl, size = 'md', showTitle } = props;
    const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;
    const initials = username.slice(0, 2).toUpperCase();

    return (
      <div className="flex flex-col items-center gap-1">
        <div
          className={`flex items-center justify-center rounded-2xl border border-brand/60 bg-gradient-to-br from-brand to-purple-800 font-bold text-white ${sizeClass}`}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt={username} className="h-full w-full rounded-2xl object-cover" />
          ) : (
            initials
          )}
        </div>
        {showTitle && (
          <span className="text-xs text-game-muted">{username}</span>
        )}
      </div>
    );
  }

  // ── Legacy API (PlayerSummary) ──
  const { player } = props;
  return (
    <div
      className={`rounded-3xl border p-3 transition ${
        player.isEliminated
          ? 'border-white/10 bg-white/5 opacity-50'
          : 'border-brand/40 bg-white/10 shadow-royale'
      }`}
    >
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gold/60 bg-gradient-to-br from-brand to-purple-800 font-bold text-white">
          {player.displayName.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold">{player.displayName}</p>
          <p className="text-sm text-white/65">Streak {player.streak}</p>
        </div>
      </div>
      <div className="text-lg font-bold text-gold">{player.score.toLocaleString()} pts</div>
    </div>
  );
};
