import { motion } from 'framer-motion';

import { socketService } from '@/services/socketService';
import type { PowerUpCode } from '@/stores/profileStore';
import { POWER_UP_META } from '@/utils/powerUps';

export interface PowerupSlot {
  type: PowerUpCode;
  /** Whether the player currently owns this power-up */
  owned: boolean;
  /** Whether it has already been used this game */
  used: boolean;
}

interface PowerUpTrayProps {
  slots: PowerupSlot[];
  roomId: string;
  /** Disable the whole tray, e.g. while answer is locked. */
  disabled?: boolean;
}

export const PowerUpTray = ({ slots, roomId, disabled = false }: PowerUpTrayProps) => {
  const handleUse = (type: PowerUpCode) => {
    socketService.emit('powerup:activate', { roomId, powerUpId: type });
  };

  return (
    <div className="flex items-center gap-3">
      {slots.map((slot) => {
        const meta = POWER_UP_META[slot.type];
        const isActive = slot.owned && !slot.used && !disabled;

        return (
          <motion.button
            key={slot.type}
            type="button"
            disabled={!isActive}
            onClick={() => isActive && handleUse(slot.type)}
            title={meta.label}
            whileHover={isActive ? { scale: 1.12, y: -4 } : {}}
            whileTap={isActive ? { scale: 0.94 } : {}}
            className={[
              'relative flex h-14 w-14 flex-col items-center justify-center rounded-2xl border text-xl transition-all',
              isActive
                ? `cursor-pointer border-white/20 bg-gradient-to-br ${meta.trayGradient} shadow-brand`
                : 'cursor-not-allowed border-white/5 bg-white/5 opacity-40',
            ].join(' ')}
          >
            <span className="leading-none select-none">{meta.icon}</span>

            {slot.used && (
              <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 text-xs font-bold text-white">
                USED
              </span>
            )}

            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold uppercase tracking-wider text-white/50">
              {meta.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
};
