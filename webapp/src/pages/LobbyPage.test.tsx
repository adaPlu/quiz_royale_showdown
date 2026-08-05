import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const mockedState = vi.hoisted(() => ({
  auth: {
    user: {
      id: 'host-user',
      username: 'Host',
      displayName: 'Host',
      email: 'host@example.com',
      level: 1,
      xp: 0,
      coins: 0,
    },
    accessToken: 'test-token',
  },
  game: {
    roomId: 'room-1',
    code: 'ABCD23',
    hostUserId: 'host-user',
    phase: 'WAITING',
    roundNumber: 0,
    totalRounds: 10,
    players: [] as Array<{
      id: string;
      displayName: string;
      score: number;
      streak: number;
      isEliminated: boolean;
    }>,
    resetRoom: vi.fn(),
  },
}));

vi.mock('@/hooks/useGameSocket', () => ({
  useGameSocket: vi.fn(),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: typeof mockedState.auth) => unknown) =>
    selector(mockedState.auth),
}));

vi.mock('@/stores/gameStore', () => ({
  selectLeaderboard: (state: typeof mockedState.game) => state.players,
  useGameStore: (selector: (state: typeof mockedState.game) => unknown) =>
    selector(mockedState.game),
}));

import { MemoryRouter } from '../navigation';
import { LobbyPage } from './LobbyPage';

function renderLobby(playerIds: string[] = ['host-user']) {
  mockedState.game.players = playerIds.map((id, index) => ({
    id,
    displayName: index === 0 ? 'Host' : `Player ${index + 1}`,
    score: 0,
    streak: 0,
    isEliminated: false,
  }));

  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/lobby/room-1']}>
      <LobbyPage />
    </MemoryRouter>,
  );
}

describe('LobbyPage', () => {
  it('labels the host and exposes solo and difficulty controls when alone', () => {
    const html = renderLobby();

    expect(html).toContain('You are Host');
    expect(html).toContain('Single Player Mode');
    expect(html).toContain('Play Solo');
    expect(html).toContain('Question Difficulty');
    expect(html).toContain('Easy');
    expect(html).toContain('Medium');
    expect(html).toContain('Hard');
    expect(html).toContain('Copy Invite');
  });

  it('shows the multiplayer start action when another player is present', () => {
    const html = renderLobby(['host-user', 'player-2']);

    expect(html).toContain('Multiplayer Mode');
    expect(html).toContain('Start Multiplayer');
  });
});
