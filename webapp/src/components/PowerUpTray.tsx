import { motion } from 'framer-motion';

import { socketService } from '@/services/socketService';

// ---------------------------------------------------------------------------
// Power-up type definitions
// ---------------------------------------------------------------------------
export type PowerupType =
  | 'fifty_fifty'
  | 'shield'
  | 'time_boost'
  | 'reveal_wrong'
  | 'second_chance';

export interface PowerupSlot {
  type: PowerupType;
  /** Whether the player currently owns this power-up */
  owned: boolean;
  /** Whether it has already been used this game */
  used: boolean;
}

interface PowerUpTrayProps {
  slots: PowerupSlot[];
  roomId: string;
  /** Disable the whole tray (e.g. while answer is locked) */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Power-up metadata
// ---------------------------------------------------------------------------
const POWERUP_META: Record<PowerupType, { label: string; icon: string; color: string }> = {
  fifty_fifty:   { label: '50 / 50',       icon: '½',  color: 'from-purple-500 to-purple-700' },
  shield:        { label: 'Shield',         icon: '🛡',  color: 'from-blue-500   to-blue-700'   },
  time_boost:    { label: 'Time Boost',     icon: '⚡',  color: 'from-yellow-400 to-yellow-600' },
  reveal_wrong:  { label: 'Reveal Wrong',   icon: '👁',  color: 'from-rose-500   to-rose-700'   },
  second_chance: { label: 'Second Chance',  icon: '↩',  color: 'from-green-500  to-green-700'  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const PowerUpTray = ({ slots, roomId, disabled = false }: PowerUpTrayProps) => {
  const handleUse = (type: PowerupType) => {
    socketService.emit('powerup:activate', { roomId, powerupId: type });
  };

  return (
    <div className="flex items-center gap-3">
      {slots.map((slot) => {
        const meta = POWERUP_META[slot.type];
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
                ? `cursor-pointer border-white/20 bg-gradient-to-br ${meta.color} shadow-brand`
                : 'cursor-not-allowed border-white/5 bg-white/5 opacity-40',
            ].join(' ')}
          >
            <span className="leading-none select-none">{meta.icon}</span>

            {/* "Used" overlay */}
            {slot.used && (
              <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 text-xs font-bold text-white">
                USED
              </span>
            )}

            {/* Tooltip label */}
            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold uppercase tracking-wider text-white/50">
              {meta.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
};
