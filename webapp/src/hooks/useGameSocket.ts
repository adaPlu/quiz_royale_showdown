import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { socketService } from '@/services/socketService';
import { useGameStore } from '@/stores/gameStore';

/**
 * Subscribes to all game-related WS events and syncs them into `gameStore`.
 * Cleans up all subscriptions on unmount.
 *
 * Must be called inside a component that has access to React Router context.
 */
export function useGameSocket(roomId: string | undefined) {
  const navigate = useNavigate();

  const applyRoomState    = useGameStore((s) => s.applyRoomState);
  const applyCountdown    = useGameStore((s) => s.applyCountdown);
  const applyQuestion     = useGameStore((s) => s.applyQuestion);
  const applyAnswerLocked = useGameStore((s) => s.applyAnswerLocked);
  const applyRoundResult  = useGameStore((s) => s.applyRoundResult);
  const applyPowerupUsed  = useGameStore((s) => s.applyPowerupUsed);
  const applyPowerupEffect = useGameStore((s) => s.applyPowerupEffect);
  const applyGameOver     = useGameStore((s) => s.applyGameOver);
  const applyLevelUp      = useGameStore((s) => s.applyLevelUp);

  useEffect(() => {
    if (roomId) {
      socketService.setActiveRoom(roomId);
    }

    const unsubs: Array<() => void> = [];

    // v1:room:state  ──────────────────────────────────────────────────────────
    unsubs.push(
      socketService.on('room:state_sync', (payload) => {
        applyRoomState(payload);
      }),
    );

    // v1:game:start countdown ─────────────────────────────────────────────────
    unsubs.push(
      socketService.on('room:countdown_start', (payload) => {
        applyCountdown(payload);
        // Navigate to game route when countdown starts (lobby → game)
        if (roomId) {
          navigate(`/game/${roomId}`, { replace: true });
        }
      }),
    );

    // v1:round:question ───────────────────────────────────────────────────────
    unsubs.push(
      socketService.on('round:question_started', (payload) => {
        applyQuestion(payload);
      }),
    );

    // v1:round:answer locked ──────────────────────────────────────────────────
    unsubs.push(
      socketService.on('round:answer_locked', (payload) => {
        applyAnswerLocked(payload);
      }),
    );

    // v1:round:end ────────────────────────────────────────────────────────────
    unsubs.push(
      socketService.on('round:result', (payload) => {
        applyRoundResult(payload);
      }),
    );

    // powerup events ──────────────────────────────────────────────────────────
    unsubs.push(
      socketService.on('powerup:used', (payload) => {
        applyPowerupUsed(payload);
      }),
    );

    unsubs.push(
      socketService.on('powerup:effect', (payload) => {
        applyPowerupEffect(payload);
      }),
    );

    // v1:game:end ─────────────────────────────────────────────────────────────
    unsubs.push(
      socketService.on('game:over', (payload) => {
        applyGameOver(payload);
        if (roomId) {
          navigate(`/results/${roomId}`);
        }
      }),
    );

    // level-up notification ───────────────────────────────────────────────────
    unsubs.push(
      socketService.on('player:level_up', (payload) => {
        applyLevelUp(payload);
      }),
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [
    roomId,
    navigate,
    applyRoomState,
    applyCountdown,
    applyQuestion,
    applyAnswerLocked,
    applyRoundResult,
    applyPowerupUsed,
    applyPowerupEffect,
    applyGameOver,
    applyLevelUp,
  ]);
}
