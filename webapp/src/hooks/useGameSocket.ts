import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { socketService } from '@/services/socketService';
import { useAuthStore } from '@/stores/authStore';
import { useGameStore } from '@/stores/gameStore';
import { useProfileStore } from '@/stores/profileStore';

export const useGameSocket = (roomId: string | undefined) => {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useEffect(() => { navigateRef.current = navigate; });
  const accessToken = useAuthStore((state) => state.accessToken);
  const joinedRef = useRef(false);
  const hasConnectedRef = useRef(false);
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

  const activeRoomId = roomId;

  useEffect(() => {
    if (!activeRoomId) return;
    const id = setInterval(() => {
      socketService.emit('client:heartbeat', { roomId: activeRoomId, sentAt: new Date().toISOString() });
    }, 15_000);
    return () => clearInterval(id);
  }, [activeRoomId]);

  useEffect(() => {
    if (accessToken) {
      socketService.connect(accessToken);
    }

    if (roomId && !joinedRef.current) {
      joinedRef.current = true;
      const roomCode = useGameStore.getState().code;
      // Guard: matchmade games store the ULID roomId as the code — don't pass it as a room code
      const isUlid = roomCode ? /^[0-9A-Z]{26}$/.test(roomCode) : true;
      const safeRoomCode = isUlid ? undefined : (roomCode ?? undefined);
      socketService.setActiveRoom(roomId, safeRoomCode);
      if (hasConnectedRef.current) {
        socketService.emit('room:reconnect', { roomId, roomCode: safeRoomCode });
      } else {
        hasConnectedRef.current = true;
        socketService.emit('room:join', { roomCode: safeRoomCode ?? roomId });
      }
    }

    const unsubs = [
      socketService.on('room:state_sync', applyRoomState),
      socketService.on('room:player_joined', applyPlayerJoined),
      socketService.on('room:player_left', applyPlayerLeft),
      socketService.on('round:countdown_started', (payload) => {
        applyCountdown(payload);
        navigateRef.current(`/game/${payload.roomId}`, { replace: true });
      }),
      socketService.on('round:question_started', (payload) => {
        applyQuestion(payload);
        navigateRef.current(`/game/${payload.roomId}`, { replace: true });
      }),
      socketService.on('round:answer_locked', applyAnswerLocked),
      socketService.on('round:result', applyRoundResult),
      socketService.on('round:elimination', applyElimination),
      socketService.on('round:finale_started', applyFinaleStarted),
      socketService.on('powerup:activated', applyPowerupUsed),
      socketService.on('powerup:effect', applyPowerupEffect),
      socketService.on('game:over', (payload) => {
        applyGameOver(payload);
        navigateRef.current(`/results/${payload.roomId}`);
      }),
      socketService.on('game:level_up', (payload) => {
        applyLevelUp(payload);
        updateXp(payload.xpAwarded, payload.newLevel, payload.xpToNextLevel);
      }),
      socketService.on('powerup:loot_drop', (payload) => {
        useGameStore.getState().setLootDrop(payload.powerupType);
      }),
    ];

    return () => {
      unsubs.forEach((unsubscribe) => unsubscribe());
      joinedRef.current = false;
      hasConnectedRef.current = false;
    };
  }, [roomId, accessToken]); // eslint-disable-line react-hooks/exhaustive-deps
};
