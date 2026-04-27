import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import type { PowerUpCode } from '@/stores/profileStore';
import { getPowerUpLabel, POWER_UP_META } from '@/utils/powerUps';

type PowerupFeedbackEvent = {
  id: string;
  kind: 'activated' | 'effect';
  powerUpCode: PowerUpCode;
  effectType?: string;
};

type PowerUpEffectBannerProps = {
  feedback: PowerupFeedbackEvent | null;
  isOwnFeedback: boolean;
};

export const PowerUpEffectBanner = ({ feedback, isOwnFeedback }: PowerUpEffectBannerProps) => {
  const shouldReduceMotion = useReducedMotion();

  const meta = feedback?.powerUpCode ? POWER_UP_META[feedback.powerUpCode] : null;
  const label = meta?.label ?? (feedback?.effectType ? getPowerUpLabel(feedback.effectType) : 'Power-up');
  const message = feedback
    ? meta?.[feedback.kind === 'activated' ? 'activatedMessage' : 'effectMessage']
      ?? (feedback.kind === 'activated' ? 'Power-up activated.' : 'Power-up effect applied.')
    : '';
  const kicker = feedback?.kind === 'activated'
    ? isOwnFeedback ? 'Activated' : 'Rival activated'
    : 'Effect';

  return (
    <AnimatePresence>
      {feedback && (
        <motion.div
          key={feedback.id}
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.96 }}
          animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
          transition={{ duration: shouldReduceMotion ? 0.12 : 0.22, ease: 'easeOut' }}
          className="pointer-events-none fixed left-1/2 top-6 z-40 w-[min(92vw,440px)] -translate-x-1/2"
        >
          <div
            className={[
              'flex items-center gap-4 rounded-3xl border bg-black/80 px-5 py-4 shadow-royale backdrop-blur',
              meta?.bannerClass ?? 'border-white/20 text-white',
            ].join(' ')}
            role="status"
            aria-live="polite"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-base font-black">
              {meta?.icon ?? '!'}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/55">{kicker}</p>
              <p className="truncate text-lg font-black text-white">{label}</p>
              <p className="truncate text-sm font-semibold text-white/70">{message}</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
