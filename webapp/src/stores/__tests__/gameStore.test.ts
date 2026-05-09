import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useGameStore } from '../gameStore';

// Reset store before each test
beforeEach(() => {
  act(() => useGameStore.getState().resetRoom());
});

describe('gameStore — server event pipeline', () => {
  it('applyServerEvent("room:state_sync") sets roomId, code, hostId, phase, players', () => {
    act(() =>
      useGameStore.getState().applyServerEvent({
        type: 'room:state_sync',
        version: 'v1',
        payload: {
          room: {
            roomId: 'room-42',
            code: 'ABC123',
            hostId: 'host-1',
            phase: 'WAITING',
            roundNumber: 1,
            totalRounds: 10,
            players: [
              { id: 'p1', displayName: 'Alice', score: 0, streak: 0, isEliminated: false },
            ],
          },
        },
      }),
    );

    const state = useGameStore.getState();
    expect(state.roomId).toBe('room-42');
    expect(state.code).toBe('ABC123');
    expect(state.hostId).toBe('host-1');
    expect(state.phase).toBe('WAITING');
    expect(state.players).toHaveLength(1);
    expect(state.players[0].displayName).toBe('Alice');
  });

  it('applyServerEvent("room:player_joined") adds a new player to the players array', () => {
    // Seed one existing player
    act(() =>
      useGameStore.setState({
        players: [{ id: 'p1', displayName: 'Alice', score: 0, streak: 0, isEliminated: false }],
      }),
    );

    act(() =>
      useGameStore.getState().applyServerEvent({
        type: 'room:player_joined',
        version: 'v1',
        payload: {
          roomId: 'room-42',
          player: { id: 'p2', displayName: 'Bob', score: 0, streak: 0, isEliminated: false },
        },
      }),
    );

    const { players } = useGameStore.getState();
    expect(players).toHaveLength(2);
    expect(players.some((p) => p.id === 'p2')).toBe(true);
  });

  it('applyServerEvent("room:player_left") removes the player by id', () => {
    act(() =>
      useGameStore.setState({
        players: [
          { id: 'p1', displayName: 'Alice', score: 0, streak: 0, isEliminated: false },
          { id: 'p2', displayName: 'Bob', score: 0, streak: 0, isEliminated: false },
        ],
      }),
    );

    act(() =>
      useGameStore.getState().applyServerEvent({
        type: 'room:player_left',
        version: 'v1',
        payload: { roomId: 'room-42', playerId: 'p1' },
      }),
    );

    const { players } = useGameStore.getState();
    expect(players).toHaveLength(1);
    expect(players[0].id).toBe('p2');
  });

  it('applyServerEvent("round:countdown_started") sets phase=COUNTDOWN, clears question, resets myAnswerIndex', () => {
    // Seed some prior state
    act(() =>
      useGameStore.setState({
        phase: 'QUESTION_ACTIVE',
        question: {
          roundId: 'r1',
          questionId: 'q1',
          prompt: 'Old question?',
          answers: ['A', 'B', 'C', 'D'],
          timeLimitMs: 20000,
          startedAt: new Date().toISOString(),
        },
        myAnswerIndex: 2,
      }),
    );

    act(() =>
      useGameStore.getState().applyServerEvent({
        type: 'round:countdown_started',
        version: 'v1',
        payload: {
          roomId: 'room-42',
          startsAt: new Date(Date.now() + 3000).toISOString(),
          seconds: 3,
        },
      }),
    );

    const state = useGameStore.getState();
    expect(state.phase).toBe('COUNTDOWN');
    expect(state.question).toBeNull();
    expect(state.myAnswerIndex).toBeNull();
  });

  it('applyServerEvent("round:question_started") sets phase=QUESTION_ACTIVE and populates question fields', () => {
    act(() =>
      useGameStore.getState().applyServerEvent({
        type: 'round:question_started',
        version: 'v1',
        payload: {
          roomId: 'room-42',
          roundId: 'round-1',
          questionId: 'q-99',
          prompt: 'What is 2+2?',
          answers: ['3', '4', '5', '6'],
          timeLimitMs: 15000,
          startedAt: new Date().toISOString(),
        },
      }),
    );

    const state = useGameStore.getState();
    expect(state.phase).toBe('QUESTION_ACTIVE');
    expect(state.question).not.toBeNull();
    expect(state.question?.prompt).toBe('What is 2+2?');
    expect(state.question?.answers).toEqual(['3', '4', '5', '6']);
    expect(state.question?.questionId).toBe('q-99');
  });

  it('applyServerEvent("round:answer_locked") sets phase=ANSWER_LOCKED', () => {
    act(() =>
      useGameStore.getState().applyServerEvent({
        type: 'round:answer_locked',
        version: 'v1',
        payload: {
          roomId: 'room-42',
          roundId: 'round-1',
          lockedAt: new Date().toISOString(),
        },
      }),
    );

    expect(useGameStore.getState().phase).toBe('ANSWER_LOCKED');
  });

  it('applyServerEvent("round:result") sets phase=ROUND_RESULT with correctAnswerIndex and rankings', () => {
    // Seed players first so rankedPlayers are resolved
    act(() =>
      useGameStore.setState({
        players: [
          { id: 'p1', displayName: 'Alice', score: 100, streak: 1, isEliminated: false },
          { id: 'p2', displayName: 'Bob', score: 80, streak: 0, isEliminated: false },
        ],
      }),
    );

    act(() =>
      useGameStore.getState().applyServerEvent({
        type: 'round:result',
        version: 'v1',
        payload: {
          roomId: 'room-42',
          roundId: 'round-1',
          correctAnswerIndex: 1,
          rankings: [
            { playerId: 'p1', scoreDelta: 100, totalScore: 200 },
            { playerId: 'p2', scoreDelta: -50, totalScore: 30 },
          ],
        },
      }),
    );

    const state = useGameStore.getState();
    expect(state.phase).toBe('ROUND_RESULT');
    expect(state.result?.correctAnswerIndex).toBe(1);
    expect(state.result?.rankings).toHaveLength(2);
  });

  it('applyServerEvent("round:elimination") sets phase=ELIMINATION, updates players to survivors list', () => {
    act(() =>
      useGameStore.getState().applyServerEvent({
        type: 'round:elimination',
        version: 'v1',
        payload: {
          roomId: 'room-42',
          eliminatedPlayerIds: ['p3'],
          survivors: [
            { id: 'p1', displayName: 'Alice', score: 200, streak: 2, isEliminated: false },
            { id: 'p2', displayName: 'Bob', score: 150, streak: 1, isEliminated: false },
          ],
        },
      }),
    );

    const state = useGameStore.getState();
    expect(state.phase).toBe('ELIMINATION');
    expect(state.players).toHaveLength(2);
    expect(state.players.every((p) => !p.isEliminated)).toBe(true);
  });

  it('applyServerEvent("game:over") sets phase=GAME_OVER, winnerId, finalScores; clears question and result', () => {
    // Seed some in-game state
    act(() =>
      useGameStore.setState({
        phase: 'ROUND_RESULT',
        question: {
          roundId: 'r1',
          questionId: 'q1',
          prompt: 'Test?',
          answers: ['A', 'B', 'C', 'D'],
          timeLimitMs: 10000,
          startedAt: new Date().toISOString(),
        },
        result: { correctAnswerIndex: 0, rankings: [] },
      }),
    );

    act(() =>
      useGameStore.getState().applyServerEvent({
        type: 'game:over',
        version: 'v1',
        payload: {
          roomId: 'room-42',
          winnerId: 'p1',
          finalStandings: [
            { playerId: 'p1', rank: 1, score: 500, xpAwarded: 200 },
            { playerId: 'p2', rank: 2, score: 300, xpAwarded: 100 },
          ],
        },
      }),
    );

    const state = useGameStore.getState();
    expect(state.phase).toBe('GAME_OVER');
    expect(state.winnerId).toBe('p1');
    expect(state.finalScores).toHaveLength(2);
    expect(state.question).toBeNull();
    expect(state.result).toBeNull();
  });

  it('setMyAnswer sets myAnswerIndex; resetRoom resets everything to initial state', () => {
    act(() => {
      useGameStore.setState({
        roomId: 'room-99',
        phase: 'QUESTION_ACTIVE',
        players: [{ id: 'p1', displayName: 'Alice', score: 10, streak: 1, isEliminated: false }],
      });
      useGameStore.getState().setMyAnswer(3);
    });

    expect(useGameStore.getState().myAnswerIndex).toBe(3);
    expect(useGameStore.getState().roomId).toBe('room-99');

    act(() => useGameStore.getState().resetRoom());

    const state = useGameStore.getState();
    expect(state.roomId).toBeNull();
    expect(state.phase).toBe('WAITING');
    expect(state.players).toHaveLength(0);
    expect(state.myAnswerIndex).toBeNull();
    expect(state.question).toBeNull();
    expect(state.result).toBeNull();
    expect(state.winnerId).toBeNull();
    expect(state.finalScores).toHaveLength(0);
  });
});
