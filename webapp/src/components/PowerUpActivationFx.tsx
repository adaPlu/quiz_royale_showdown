import { AnimatePresence, motion } from 'framer-motion';

import type { PowerUpCode } from '@/stores/profileStore';

const FX_META: Record<PowerUpCode, { label: string; emoji: string; color: string }> = {
  FIFTY_FIFTY: { label: '50 / 50', emoji: '✂️', color: 'from-violet-600 to-fuchsia-700' },
  SHIELD: { label: 'Shield Active', emoji: '🛡️', color: 'from-sky-500 to-blue-700' },
  TIME_FREEZE: { label: 'Time Frozen', emoji: '⏱️', color: 'from-amber-400 to-orange-600' },
  SABOTAGE: { label: 'Sabotage!', emoji: '👁️', color: 'from-rose-500 to-red-700' },
  DOUBLE_DOWN: { label: 'Double Down!', emoji: '🔄', color: 'from-emerald-500 to-green-700' },
};

interface PowerUpActivationFxProps {
  powerupCode: PowerUpCode | null;
  activatingUserId: string;
  currentUserId: string;
  onComplete: () => void;
}

export const PowerUpActivationFx = ({
  powerupCode,
  activatingUserId,
  currentUserId,
  onComplete,
}: PowerUpActivationFxProps) => {
  const meta = powerupCode ? FX_META[powerupCode] : null;
  const isMine = activatingUserId === currentUserId;

  return (
    <AnimatePresence>
      {powerupCode && meta && (
        <motion.div
          key={powerupCode}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onAnimationComplete={() => {
            setTimeout(onComplete, 1400);
          }}
          className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center"
        >
          {/* Radial burst ring */}
          <motion.div
            initial={{ scale: 0.4, opacity: 0.8 }}
            animate={{ scale: 2.5, opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className={`absolute h-64 w-64 rounded-full bg-gradient-to-br ${meta.color} blur-2xl`}
          />

          {/* Centre card */}
          <motion.div
            initial={{ scale: 0.6, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.8, y: -20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            className={`relative flex flex-col items-center gap-2 rounded-3xl bg-gradient-to-br ${meta.color} px-10 py-8 shadow-2xl`}
          >
            <span className="text-5xl">{meta.emoji}</span>
            <span className="text-xl font-black uppercase tracking-widest text-white">
              {meta.label}
            </span>
            {!isMine && (
              <span className="text-sm text-white/70">Activated by opponent</span>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
