import type { PowerUpCode } from '@/stores/profileStore';

export type PowerUpFeedbackKind = 'activated' | 'effect';

export type PowerUpMeta = {
  label: string;
  icon: string;
  trayGradient: string;
  bannerClass: string;
  activatedMessage: string;
  effectMessage: string;
};

const KNOWN_POWER_UP_CODES: readonly PowerUpCode[] = [
  'DOUBLE_DOWN',
  'FIFTY_FIFTY',
  'TIME_FREEZE',
  'SHIELD',
  'SABOTAGE',
];

export const POWER_UP_META: Record<PowerUpCode, PowerUpMeta> = {
  DOUBLE_DOWN: {
    label: 'Double Down',
    icon: '2X',
    trayGradient: 'from-emerald-400 to-teal-700',
    bannerClass: 'border-emerald-300/50 bg-emerald-500/15 text-emerald-100',
    activatedMessage: 'Next correct answer scores double.',
    effectMessage: 'Double score effect is active.',
  },
  FIFTY_FIFTY: {
    label: '50 / 50',
    icon: '1/2',
    trayGradient: 'from-violet-500 to-fuchsia-700',
    bannerClass: 'border-fuchsia-300/50 bg-fuchsia-500/15 text-fuchsia-100',
    activatedMessage: 'A private hint is being prepared.',
    effectMessage: 'Two wrong answers were removed.',
  },
  TIME_FREEZE: {
    label: 'Time Freeze',
    icon: '+5',
    trayGradient: 'from-cyan-400 to-blue-800',
    bannerClass: 'border-cyan-300/50 bg-cyan-500/15 text-cyan-100',
    activatedMessage: 'Bonus time has been added.',
    effectMessage: 'Timer pressure has eased.',
  },
  SHIELD: {
    label: 'Shield',
    icon: 'SH',
    trayGradient: 'from-amber-300 to-orange-700',
    bannerClass: 'border-amber-300/50 bg-amber-500/15 text-amber-100',
    activatedMessage: 'Elimination protection is active.',
    effectMessage: 'Shield protection is holding.',
  },
  SABOTAGE: {
    label: 'Sabotage',
    icon: 'SB',
    trayGradient: 'from-rose-500 to-red-800',
    bannerClass: 'border-rose-300/50 bg-rose-500/15 text-rose-100',
    activatedMessage: 'An opponent has been disrupted.',
    effectMessage: 'Sabotage effect landed.',
  },
};

export const normalizePowerUpCode = (value: unknown): PowerUpCode | null => {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toUpperCase();
  const code = KNOWN_POWER_UP_CODES.find((candidate) => candidate === normalized);
  return code ?? null;
};

export const getPowerUpLabel = (value: string): string =>
  value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
