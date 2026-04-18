import React from 'react';

type Rank = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Champion';

const RANK_CONFIG: Record<Rank, { color: string; bg: string; emoji: string }> = {
  Bronze:   { color: 'text-amber-700',  bg: 'bg-amber-900/30 border-amber-700/50', emoji: '🥉' },
  Silver:   { color: 'text-gray-300',   bg: 'bg-gray-700/30 border-gray-500/50',   emoji: '🥈' },
  Gold:     { color: 'text-gold',       bg: 'bg-gold/10 border-gold/40',           emoji: '🥇' },
  Platinum: { color: 'text-cyan-300',   bg: 'bg-cyan-900/30 border-cyan-500/50',   emoji: '💎' },
  Diamond:  { color: 'text-sky-300',    bg: 'bg-sky-900/30 border-sky-400/50',     emoji: '💠' },
  Champion: { color: 'text-brand',      bg: 'bg-brand/20 border-brand/50',         emoji: '👑' },
};

interface SeasonRankBadgeProps {
  rank: string;
  className?: string;
}

export function SeasonRankBadge({ rank, className = '' }: SeasonRankBadgeProps) {
  const cfg = RANK_CONFIG[rank as Rank] ?? RANK_CONFIG.Bronze;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${cfg.bg} ${cfg.color} ${className}`}
      aria-label={`Season rank: ${rank}`}
    >
      <span aria-hidden="true">{cfg.emoji}</span>
      {rank}
    </span>
  );
}
