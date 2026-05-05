import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { socketService } from '@/services/socketService';
import { useAuthStore } from '@/stores/authStore';
import { useGameStore } from '@/stores/gameStore';
import { useProfileStore } from '@/stores/profileStore';

export const useGameSocket = (roomId: string | undefined) => {
  const navigate = useNavigate();
  const accessToken = useAuthStore((state) => state.accessToken);
  const applyRoomState = useGameStore((state) => state.applyRoomState);
  const applyPlayerJoined = useGameStore((state) => state.applyPlayerJoined);
  const applyPlayerLeft = useGameStore((state) => state.applyPlayerLeft);
  const applyCountdown = useGameStore((state) => state.applyCountdown);
  const applyQuestion = useGameStore((state) => state.applyQuestion);
  const applyAnswerLocked = useGameStore((state) => state.applyAnswerLocked);
  const applyRoundResult = useGameStore((state) => state.applyRoundResult);
  const applyElimination = useGameStore((state) => state.applyElimination);
  const applyFinaleStarted = useGameStore((state) => state.applyFinaleStarted);
  const applyPowerupUsed = useGameStore((state) => state.applyPowerupUsed);
  const applyPowerupEffect = useGameStore((state) => state.applyPowerupEffect);
  const applyGameOver = useGameStore((state) => state.applyGameOver);
  const applyLevelUp = useGameStore((state) => state.applyLevelUp);
  const updateXp = useProfileStore((state) => state.updateXp);

  useEffect(() => {
    const token = accessToken ?? localStorage.getItem('qrs.accessToken');
    if (token) {
      socketService.connect(token);
    }

    if (roomId) {
      const roomCode = useGameStore.getState().code;
      socketService.setActiveRoom(roomId, roomCode ?? undefined);
      socketService.emit('room:join', { roomCode: roomId });
    }

    const unsubs = [
      socketService.on('room:state_sync', applyRoomState),
      socketService.on('room:player_joined', applyPlayerJoined),
      socketService.on('room:player_left', applyPlayerLeft),
      socketService.on('round:countdown_started', (payload) => {
        applyCountdown(payload);
        navigate(`/game/${payload.roomId}`, { replace: true });
      }),
      socketService.on('round:question_started', (payload) => {
        applyQuestion(payload);
        navigate(`/game/${payload.roomId}`, { replace: true });
      }),
      socketService.on('round:answer_locked', applyAnswerLocked),
      socketService.on('round:result', applyRoundResult),
      socketService.on('round:elimination', applyElimination),
      socketService.on('round:finale_started', applyFinaleStarted),
      socketService.on('powerup:activated', applyPowerupUsed),
      socketService.on('powerup:effect', applyPowerupEffect),
      socketService.on('game:over', (payload) => {
        applyGameOver(payload);
        navigate(`/results/${payload.roomId}`);
      }),
      socketService.on('game:level_up', (payload) => {
        applyLevelUp(payload);
        updateXp(payload.xpAwarded, payload.newLevel);
      }),
    ];

    return () => {
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [
    accessToken,
    roomId,
    navigate,
    applyRoomState,
    applyPlayerJoined,
    applyPlayerLeft,
    applyCountdown,
    applyQuestion,
    applyAnswerLocked,
    applyRoundResult,
    applyElimination,
    applyFinaleStarted,
    applyPowerupUsed,
    applyPowerupEffect,
    applyGameOver,
    applyLevelUp,
    updateXp,
  ]);
};
