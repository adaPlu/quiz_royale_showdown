import React, { useEffect, useRef } from 'react';

interface XpBarProps {
  current: number;
  max: number;
  level: number;
  animated?: boolean;
  className?: string;
}

export function XpBar({ current, max, level, animated = true, className = '' }: XpBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const pct = Math.min((current / max) * 100, 100);

  useEffect(() => {
    if (!animated || !barRef.current) return;
    barRef.current.style.width = '0%';
    const t = requestAnimationFrame(() => {
      if (barRef.current) barRef.current.style.width = `${pct}%`;
    });
    return () => cancelAnimationFrame(t);
  }, [pct, animated]);

  return (
    <div className={`w-full ${className}`}>
      <div className="flex justify-between text-xs text-game-muted mb-1">
        <span className="font-semibold text-white">Level {level}</span>
        <span>{current.toLocaleString()} / {max.toLocaleString()} XP</span>
      </div>
      <div className="h-3 bg-game-card rounded-full overflow-hidden border border-game-border">
        <div
          ref={barRef}
          className="h-full rounded-full bg-brand transition-[width] duration-1000 ease-out"
          style={{ width: animated ? '0%' : `${pct}%` }}
          role="progressbar"
          aria-valuenow={current}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={`${current} of ${max} XP to next level`}
        />
      </div>
    </div>
  );
}
