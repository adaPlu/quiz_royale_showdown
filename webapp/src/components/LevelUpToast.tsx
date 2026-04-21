import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';

interface LevelUpToastProps {
  level: number | null;
  onDismiss: () => void;
}

export const LevelUpToast = ({ level, onDismiss }: LevelUpToastProps) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (level === null) return;
    timerRef.current = setTimeout(onDismiss, 3000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [level, onDismiss]);

  return (
    <AnimatePresence>
      {level !== null && (
        <motion.div
          key={`level-up-${level}`}
          initial={{ y: 80, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 80, opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2"
        >
          <div className="flex items-center gap-4 rounded-[24px] border border-gold/50 bg-black/90 px-6 py-4 shadow-[0_0_40px_rgba(255,215,0,0.25)] backdrop-blur">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/20 text-2xl">
              ⭐
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-gold">Level Up!</p>
              <p className="text-xl font-black text-white">You reached Level {level}</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
