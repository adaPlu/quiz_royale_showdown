import { motion, useAnimationControls } from 'framer-motion';
import { useEffect, useRef } from 'react';

type CountdownBarProps = {
  duration: number;
  animationKey?: string | number;
  onExpire?: () => void;
  startedAt?: string;
};

export const CountdownBar = ({ duration, animationKey, onExpire, startedAt }: CountdownBarProps) => {
  const controls = useAnimationControls();
  const blurControls = useAnimationControls();
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    let cancelled = false;

    const elapsed = startedAt ? (Date.now() - new Date(startedAt).getTime()) / 1000 : 0;
    const remaining = Math.max(0, duration - elapsed);
    const initialScale = duration > 0 ? Math.min(1, Math.max(0, remaining / duration)) : 0;

    controls.set({ scaleX: initialScale });
    blurControls.set({ scaleX: initialScale });
    controls
      .start({
        scaleX: 0,
        transition: { duration: remaining, ease: 'linear' },
      })
      .then(() => {
        if (!cancelled) onExpireRef.current?.();
      });
    blurControls.start({ scaleX: 0, transition: { duration: remaining, ease: 'linear' } });

    return () => {
      cancelled = true;
      controls.stop();
      blurControls.stop();
    };
  }, [animationKey, controls, blurControls, duration, startedAt]);

  return (
    <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/10">
      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-answer-correct via-gold to-answer-wrong opacity-20" />
      <motion.div
        animate={controls}
        className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-gradient-to-r from-answer-correct via-gold to-answer-wrong"
      />
      <motion.div
        animate={blurControls}
        className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-gradient-to-r from-answer-correct via-gold to-answer-wrong opacity-40 blur-sm"
      />
    </div>
  );
};
