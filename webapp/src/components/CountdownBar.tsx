import { motion, useAnimationControls } from 'framer-motion';
import { useEffect, useRef } from 'react';

type CountdownBarProps = {
  duration: number;
  animationKey?: string | number;
  onExpire?: () => void;
};

export const CountdownBar = ({ duration, animationKey, onExpire }: CountdownBarProps) => {
  const controls = useAnimationControls();
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    let cancelled = false;

    controls.set({ scaleX: 1 });
    controls
      .start({
        scaleX: 0,
        transition: { duration, ease: 'linear' },
      })
      .then(() => {
        if (!cancelled) onExpireRef.current?.();
      });

    return () => {
      cancelled = true;
      controls.stop();
    };
  }, [animationKey, controls, duration]);

  return (
    <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/10">
      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-answer-correct via-gold to-answer-wrong opacity-20" />
      <motion.div
        animate={controls}
        className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-gradient-to-r from-answer-correct via-gold to-answer-wrong"
      />
      <motion.div
        animate={controls}
        className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-gradient-to-r from-answer-correct via-gold to-answer-wrong opacity-40 blur-sm"
      />
    </div>
  );
};
