import React from 'react';
import { useGameStore } from '@/stores/gameStore';

export const LevelUpToast: React.FC = () => {
  const levelUpQueue = useGameStore((s) => s.levelUpQueue);
  const dismissLevelUp = useGameStore((s) => s.dismissLevelUp);

  const entry = levelUpQueue[0];
  if (!entry) return null;

  const progressPercent =
    entry.xpToNextLevel > 0
      ? Math.min(100, Math.round((entry.xp / entry.xpToNextLevel) * 100))
      : 100;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Level up notification"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div className="bg-game-surface border border-gold/40 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/20 text-3xl mx-auto mb-3">
          ⭐
        </div>
        <p className="text-gold text-xs font-semibold uppercase tracking-widest mb-1">Level Up!</p>
        <p className="text-white text-4xl font-black mb-1">Level {entry.newLevel}</p>
        <p className="text-gold font-bold text-lg mb-5">+{entry.xp} XP</p>

        <div className="mb-5">
          <div className="flex justify-between text-xs text-game-muted mb-1">
            <span>Progress</span>
            <span>{entry.xpToNextLevel} XP to next level</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-gold rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={dismissLevelUp}
          className="w-full py-3 rounded-xl bg-brand text-white font-bold hover:opacity-90 transition-opacity"
        >
          Continue
        </button>
      </div>
    </div>
  );
};
