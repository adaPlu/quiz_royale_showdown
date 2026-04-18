import { motion } from 'framer-motion';

import { socketService } from '@/services/socketService';

export type PowerUpType =
  | 'fifty_fifty'
  | 'shield'
  | 'time_boost'
  | 'reveal_wrong'
  | 'second_chance';

export type PowerUpSlot = {
  type: PowerUpType;
  owned: boolean;
  used: boolean;
  count?: number;
};

type PowerUpTrayProps = {
  slots: PowerUpSlot[];
  roomId: string;
  disabled?: boolean;
};

const POWER_UP_META: Record<PowerUpType, { label: string; icon: string; color: string }> = {
  fifty_fifty: { label: '50 / 50', icon: '1/2', color: 'from-violet-500 to-fuchsia-700' },
  shield: { label: 'Shield', icon: 'SH', color: 'from-sky-500 to-blue-800' },
  time_boost: { label: 'Time', icon: '+T', color: 'from-amber-400 to-orange-700' },
  reveal_wrong: { label: 'Reveal', icon: 'RW', color: 'from-rose-500 to-red-800' },
  second_chance: { label: 'Retry', icon: '2X', color: 'from-emerald-500 to-green-800' },
};

export const PowerUpTray = ({ slots, roomId, disabled = false }: PowerUpTrayProps) => {
  const activatePowerUp = (type: PowerUpType) => {
    socketService.emit('powerup:activate', { roomId, powerUpId: type });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {slots.map((slot) => {
        const meta = POWER_UP_META[slot.type];
        const isActive = slot.owned && !slot.used && !disabled;

        return (
          <motion.button
            key={slot.type}
            type="button"
            disabled={!isActive}
            onClick={() => activatePowerUp(slot.type)}
            title={meta.label}
            whileHover={isActive ? { scale: 1.08, y: -3 } : undefined}
            whileTap={isActive ? { scale: 0.96 } : undefined}
            className={[
              'relative flex h-14 w-14 flex-col items-center justify-center rounded-2xl border text-sm font-black transition-all',
              isActive
                ? `border-white/20 bg-gradient-to-br ${meta.color} text-white shadow-brand`
                : 'cursor-not-allowed border-white/5 bg-white/5 text-white/40 opacity-60',
            ].join(' ')}
          >
            <span>{meta.icon}</span>
            {typeof slot.count === 'number' && slot.count > 1 && (
              <span className="absolute -right-1 -top-1 rounded-full bg-gold px-1.5 py-0.5 text-[10px] text-black">
                {slot.count}
              </span>
            )}
            {slot.used && (
              <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60 text-[10px] tracking-wide">
                USED
              </span>
            )}
            <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold uppercase tracking-wider text-white/45">
              {meta.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
};
