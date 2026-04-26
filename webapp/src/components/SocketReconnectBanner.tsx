import { AnimatePresence, motion } from 'framer-motion';
import { useSocketStatus } from '@/hooks/useSocketStatus';

export function SocketReconnectBanner() {
  const { reconnecting } = useSocketStatus();

  return (
    <AnimatePresence>
      {reconnecting && (
        <motion.div
          initial={{ y: -48 }}
          animate={{ y: 0 }}
          exit={{ y: -48 }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 py-2 text-sm font-semibold text-black"
        >
          <span className="h-2 w-2 animate-ping rounded-full bg-black/40" />
          Reconnecting to server…
        </motion.div>
      )}
    </AnimatePresence>
  );
}
