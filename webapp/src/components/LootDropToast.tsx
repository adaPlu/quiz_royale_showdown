import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';

import type { PowerUpCode as PowerupType } from '@/stores/profileStore';

const ICONS: Record<PowerupType, string> = {
  FIFTY_FIFTY: '✂️',
  SHIELD: '🛡️',
  TIME_FREEZE: '⏱️',
  SABOTAGE: '👁️',
  DOUBLE_DOWN: '🔄',
};

const LABELS: Record<PowerupType, string> = {
  FIFTY_FIFTY: '50 / 50',
  SHIELD: 'Shield',
  TIME_FREEZE: 'Time Freeze',
  SABOTAGE: 'Sabotage',
  DOUBLE_DOWN: 'Double Down',
};

interface LootDropToastProps {
  powerupCode: PowerupType | null;
  onDismiss: () => void;
}

export const LootDropToast = ({ powerupCode, onDismiss }: LootDropToastProps) => {
  useEffect(() => {
    if (!powerupCode) return;
    const timer = setTimeout(onDismiss, 2500);
    return () => clearTimeout(timer);
  }, [powerupCode, onDismiss]);

  return (
    <AnimatePresence>
      {powerupCode && (
        <motion.div
          key={powerupCode + Date.now()}
          initial={{ x: 120, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 120, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className="fixed right-4 top-4 z-50 flex items-center gap-3 rounded-2xl border border-gold/30 bg-[#0E0E1A]/90 px-5 py-4 shadow-2xl backdrop-blur"
        >
          <span className="text-2xl">{ICONS[powerupCode]}</span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gold">Loot Drop!</p>
            <p className="font-black text-white">You got: {LABELS[powerupCode]}</p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="ml-2 text-white/40 hover:text-white"
          >
            ×
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
