import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { MemoryRouter } from '../navigation';
import { LobbyPage } from './LobbyPage';
import { useAuthStore } from '@/stores/authStore';
import { useGameStore } from '@/stores/gameStore';

function renderLobby(playerIds: string[] = ['host-user']) {
  useAuthStore.setState({
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
  });
  useGameStore.setState({
    roomId: 'room-1',
    code: 'ABCD23',
    hostUserId: 'host-user',
    phase: 'WAITING',
    roundNumber: 0,
    totalRounds: 10,
    players: playerIds.map((id, index) => ({
      id,
      displayName: index === 0 ? 'Host' : `Player ${index + 1}`,
      score: 0,
      streak: 0,
      isEliminated: false,
    })),
  });

  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/lobby/room-1']}>
      <LobbyPage />
    </MemoryRouter>,
  );
}

describe('LobbyPage', () => {
  beforeEach(() => {
    useGameStore.getState().resetRoom();
    useAuthStore.setState({ user: null, accessToken: null });
  });

  it('labels the host and exposes an explicit solo mode when alone', () => {
    const html = renderLobby();

    expect(html).toContain('You are Host');
    expect(html).toContain('Single Player Mode');
    expect(html).toContain('Play Solo');
    expect(html).toContain('Copy Invite');
  });

  it('shows the multiplayer start action when another player is present', () => {
    const html = renderLobby(['host-user', 'player-2']);

    expect(html).toContain('Multiplayer Mode');
    expect(html).toContain('Start Multiplayer');
  });
});
