import { motion, useAnimation } from 'framer-motion';
import { useEffect, useRef } from 'react';

interface CountdownBarProps {
  /** Total duration in seconds (e.g. 20) */
  duration: number;
  /** Called when the bar reaches zero */
  onExpire?: () => void;
  /** Key — change to reset the animation (e.g. pass questionId) */
  animationKey?: string | number;
}

/**
 * Animated horizontal progress bar that drains from 100 % → 0 % over
 * `duration` seconds. Color shifts green → yellow → red as time runs out.
 */
export const CountdownBar = ({ duration, onExpire, animationKey }: CountdownBarProps) => {
  const controls = useAnimation();
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    let cancelled = false;

    controls.set({ scaleX: 1 });

    controls
      .start({
        scaleX: 0,
        transition: {
          duration,
          ease: 'linear',
        },
      })
      .then(() => {
        if (!cancelled) {
          onExpireRef.current?.();
        }
      });

    return () => {
      cancelled = true;
      controls.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animationKey, duration]);

  return (
    <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/10">
      {/* Color gradient track — always visible behind the bar */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-answer-correct via-yellow-400 to-answer-wrong opacity-20" />

      {/* Animated fill */}
      <motion.div
        className="absolute inset-y-0 left-0 w-full origin-left rounded-full"
        animate={controls}
        style={{
          background:
            'linear-gradient(90deg, #22C55E 0%, #EAB308 55%, #EF4444 100%)',
        }}
      />

      {/* Glow pulse overlay */}
      <motion.div
        className="absolute inset-y-0 left-0 w-full origin-left rounded-full opacity-40 blur-sm"
        animate={controls}
        style={{
          background:
            'linear-gradient(90deg, #22C55E 0%, #EAB308 55%, #EF4444 100%)',
        }}
      />
    </div>
  );
};
