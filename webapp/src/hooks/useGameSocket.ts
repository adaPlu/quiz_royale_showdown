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

  const activeRoomId = roomId;
  const phase = useGameStore((state) => state.phase);

  useEffect(() => {
    if (!activeRoomId) return;
    const heartbeatPhases = ['QUESTION_ACTIVE', 'ANSWER_LOCKED'];
    if (!heartbeatPhases.includes(phase)) return;
    const id = setInterval(() => {
      socketService.emit('client:heartbeat', { roomId: activeRoomId, sentAt: new Date().toISOString() });
    }, 15_000);
    return () => clearInterval(id);
  }, [activeRoomId, phase]);

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

    // All gameStore action selectors are read via getState() inside callbacks so that
    // Zustand's stable action references never need to be listed as effect dependencies.
    const unsubs = [
      socketService.on('room:state_sync', (payload) => {
        useGameStore.getState().applyRoomState(payload);
      }),
      socketService.on('room:player_joined', (payload) => {
        useGameStore.getState().applyPlayerJoined(payload);
      }),
      socketService.on('room:player_left', (payload) => {
        useGameStore.getState().applyPlayerLeft(payload);
      }),
      socketService.on('round:countdown_started', (payload) => {
        if (payload.roomId !== activeRoomId) return;
        useGameStore.getState().applyCountdown(payload);
        navigateRef.current(`/game/${payload.roomId}`, { replace: true });
      }),
      socketService.on('round:question_started', (payload) => {
        if (payload.roomId !== activeRoomId) return;
        useGameStore.getState().applyQuestion(payload);
        navigateRef.current(`/game/${payload.roomId}`, { replace: true });
      }),
      socketService.on('round:answer_locked', (payload) => {
        useGameStore.getState().applyAnswerLocked(payload);
      }),
      socketService.on('round:result', (payload) => {
        useGameStore.getState().applyRoundResult(payload);
      }),
      socketService.on('round:elimination', (payload) => {
        useGameStore.getState().applyElimination(payload);
      }),
      socketService.on('round:finale_started', (payload) => {
        useGameStore.getState().applyFinaleStarted(payload);
      }),
      socketService.on('powerup:activated', (payload) => {
        useGameStore.getState().applyPowerupUsed(payload);
      }),
      socketService.on('powerup:effect', (payload) => {
        useGameStore.getState().applyPowerupEffect(payload);
      }),
      socketService.on('game:over', (payload) => {
        useGameStore.getState().applyGameOver(payload);
        navigateRef.current(`/results/${payload.roomId}`);
      }),
      socketService.on('game:level_up', (payload) => {
        useGameStore.getState().applyLevelUp(payload);
        useProfileStore.getState().updateXp(payload.xpAwarded, payload.newLevel, payload.xpToNextLevel);
      }),
      socketService.on('powerup:loot_drop', (payload) => {
        useGameStore.getState().setLootDrop(payload.powerupType);
      }),
      // Surface socket-level errors as a dismissible banner in GamePage (TASK 4 / S1-3).
      socketService.on('error', (payload) => {
        const msg = payload.message ?? payload.error ?? 'A socket error occurred.';
        useGameStore.getState().setSocketError(msg);
      }),
    ];

    return () => {
      unsubs.forEach((unsubscribe) => unsubscribe());
      joinedRef.current = false;
      hasConnectedRef.current = false;
    };
    // roomId and accessToken are the only runtime variables that should trigger a reconnect.
    // All store actions are accessed via getState() to avoid stale-closure deps.
  }, [roomId, accessToken]);
};
