import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { powerupLootDropPayloadSchema } from '@/lib/contracts';
import { socketService } from '@/services/socketService';
import { useGameStore } from '@/stores/gameStore';

export function useGameSocket(roomId: string | undefined) {
  const navigate = useNavigate();

  const roomCode = useGameStore((state) => state.code);
  const applyRoomState = useGameStore((state) => state.applyRoomState);
  const applyPlayerJoined = useGameStore((state) => state.applyPlayerJoined);
  const applyPlayerLeft = useGameStore((state) => state.applyPlayerLeft);
  const applyCountdown = useGameStore((state) => state.applyCountdown);
  const applyQuestion = useGameStore((state) => state.applyQuestion);
  const applyAnswerLocked = useGameStore((state) => state.applyAnswerLocked);
  const applyRoundResult = useGameStore((state) => state.applyRoundResult);
  const applyElimination = useGameStore((state) => state.applyElimination);
  const applyFinaleStarted = useGameStore((state) => state.applyFinaleStarted);
  const applyGameOver = useGameStore((state) => state.applyGameOver);
  const applyLootDrop = useGameStore((state) => state.applyLootDrop);

  useEffect(() => {
    if (roomId && roomCode) {
      socketService.setActiveRoom({ roomId, roomCode });
    }
  }, [roomCode, roomId]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(
      socketService.on('room:state_sync', (payload) => {
        applyRoomState(payload);
        socketService.updateRoomSnapshot(payload.room.roomId, payload.room.code);

        if (payload.room.phase === 'GAME_OVER') {
          navigate(`/results/${payload.room.roomId}`, { replace: true });
          return;
        }

        if (payload.room.phase !== 'WAITING') {
          navigate(`/game/${payload.room.roomId}`, { replace: true });
        }
      }),
    );

    unsubs.push(
      socketService.on('room:player_joined', (payload) => {
        applyPlayerJoined(payload);
      }),
    );

    unsubs.push(
      socketService.on('room:player_left', (payload) => {
        applyPlayerLeft(payload);
      }),
    );

    unsubs.push(
      socketService.on('round:countdown_started', (payload) => {
        applyCountdown(payload);
        navigate(`/game/${payload.roomId}`, { replace: true });
      }),
    );

    unsubs.push(
      socketService.on('round:question_started', (payload) => {
        applyQuestion(payload);
      }),
    );

    unsubs.push(
      socketService.on('round:answer_locked', (payload) => {
        applyAnswerLocked(payload);
      }),
    );

    unsubs.push(
      socketService.on('round:result', (payload) => {
        applyRoundResult(payload);
      }),
    );

    unsubs.push(
      socketService.on('round:elimination', (payload) => {
        applyElimination(payload);
      }),
    );

    unsubs.push(
      socketService.on('round:finale_started', (payload) => {
        applyFinaleStarted(payload);
      }),
    );

    unsubs.push(
      socketService.on('game:over', (payload) => {
        applyGameOver(payload);
        navigate(`/results/${payload.roomId}`, { replace: true });
      }),
    );

    unsubs.push(
      socketService.on('powerup:loot_drop', (payload) => {
        const parsed = powerupLootDropPayloadSchema.safeParse(payload);
        if (parsed.success) {
          applyLootDrop(parsed.data.powerupType, parsed.data.quantity);
        }
      }),
    );

    unsubs.push(
      socketService.on('error', (payload) => {
        console.error('[socket] Server error:', payload.code, payload.message, payload.details);
      }),
    );

    return () => {
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [
    applyAnswerLocked,
    applyCountdown,
    applyElimination,
    applyFinaleStarted,
    applyGameOver,
    applyLootDrop,
    applyPlayerJoined,
    applyPlayerLeft,
    applyQuestion,
    applyRoomState,
    applyRoundResult,
    navigate,
  ]);
}
