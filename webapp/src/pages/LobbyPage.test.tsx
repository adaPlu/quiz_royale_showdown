import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MemoryRouter } from '../navigation';
import { LobbyPage } from './LobbyPage';
import { useGameStore } from '@/stores/gameStore';

function renderLobby() {
  useGameStore.setState({
    roomId: 'room-1',
    code: 'ABCD2345',
    phase: 'WAITING',
    roundNumber: 0,
    totalRounds: 10,
    players: [
      {
        id: 'host-user',
        displayName: 'Host',
        score: 0,
        streak: 0,
        isEliminated: false,
      },
    ],
  });

  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/lobby/room-1']}>
      <LobbyPage />
    </MemoryRouter>,
  );
}

describe('LobbyPage', () => {
  it('shows one unrestricted start action and invite controls while waiting alone', () => {
    const html = renderLobby();

    expect(html).toContain('Start Game');
    expect(html).not.toContain('Start Solo');
    expect(html).not.toContain('Start Multiplayer');
    expect(html).toContain('Manual start works with any player count.');
    expect(html).toContain('Copy Invite');
    expect(html).toContain('Copy for Friends');
    expect(html).toContain('Email Invite');
  });
});
