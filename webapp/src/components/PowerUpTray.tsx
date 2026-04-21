import { motion, useReducedMotion } from 'framer-motion';

import { socketService } from '@/services/socketService';
import type { PowerUpCode } from '@/stores/profileStore';
import { POWER_UP_META } from '@/utils/powerUps';

export type PowerUpSlot = {
  code: PowerUpCode;
  powerUpId?: string;
  owned: boolean;
  used: boolean;
  count?: number;
  targetPlayerId?: string;
  targetLabel?: string;
  unavailableReason?: string;
};

type PowerUpTrayProps = {
  slots: PowerUpSlot[];
  roomId: string;
  disabled?: boolean;
};

export const PowerUpTray = ({ slots, roomId, disabled = false }: PowerUpTrayProps) => {
  const shouldReduceMotion = useReducedMotion();

  const activatePowerUp = (slot: PowerUpSlot) => {
    socketService.emit('powerup:activate', {
      roomId,
      powerUpId: slot.powerUpId ?? slot.code,
      ...(slot.targetPlayerId ? { targetPlayerId: slot.targetPlayerId } : {}),
    });
  };

  return (
    <div className="grid w-full grid-cols-5 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-3">
      {slots.map((slot) => {
        const meta = POWER_UP_META[slot.code];
        const reason = slot.unavailableReason ?? (!slot.owned ? 'Not in inventory' : undefined);
        const isActive = slot.owned && !slot.used && !disabled && !reason;
        const title = reason ?? (slot.targetLabel
          ? `${meta.label}: ${slot.targetLabel}`
          : meta.label);

        return (
          <motion.button
            key={slot.code}
            type="button"
            disabled={!isActive}
            onClick={() => activatePowerUp(slot)}
            title={title}
            whileHover={isActive && !shouldReduceMotion ? { scale: 1.08, y: -3 } : undefined}
            whileTap={isActive && !shouldReduceMotion ? { scale: 0.96 } : undefined}
            className={[
              'relative flex h-16 min-w-0 flex-col items-center justify-center rounded-2xl border text-sm font-black transition-all sm:w-16',
              isActive
                ? `border-white/20 bg-gradient-to-br ${meta.trayGradient} text-white shadow-brand`
                : 'cursor-not-allowed border-white/5 bg-white/5 text-white/40 opacity-60',
            ].join(' ')}
          >
            <span className="text-base leading-none">{meta.icon}</span>
            {typeof slot.count === 'number' && slot.count > 0 && (
              <span className="absolute -right-1 -top-1 rounded-full bg-gold px-1.5 py-0.5 text-[10px] text-black">
                {slot.count}
              </span>
            )}
            {slot.used && (
              <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60 text-[10px] tracking-wide">
                USED
              </span>
            )}
            <span className="absolute -bottom-5 left-1/2 w-16 -translate-x-1/2 truncate text-center text-[9px] font-semibold uppercase tracking-wider text-white/45">
              {meta.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
};
