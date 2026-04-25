import { AnimatePresence, motion } from 'framer-motion';
import { useSocketStatus } from '@/hooks/useSocketStatus';

export function ReconnectBanner() {
  const { reconnecting } = useSocketStatus();

  return (
    <AnimatePresence>
      {reconnecting && (
        <motion.div
          key="reconnect-banner"
          initial={{ y: -48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -48, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-x-0 top-0 z-[9999] flex items-center justify-center gap-2 bg-amber-600/90 py-2 text-sm font-semibold text-white backdrop-blur"
        >
          <span className="h-2 w-2 animate-ping rounded-full bg-white" />
          Reconnecting to server…
        </motion.div>
      )}
    </AnimatePresence>
  );
}
