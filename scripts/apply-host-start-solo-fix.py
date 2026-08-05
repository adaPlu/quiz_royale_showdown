from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected 1 match, found {count} for {old[:100]!r}")
    file_path.write_text(text.replace(old, new, 1))
    print(f"updated {path}")


def replace_between(path: str, start: str, end: str, replacement: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    start_index = text.find(start)
    if start_index < 0:
        raise RuntimeError(f"{path}: start marker not found: {start!r}")
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise RuntimeError(f"{path}: end marker not found: {end!r}")
    file_path.write_text(text[:start_index] + replacement + text[end_index:])
    print(f"updated block in {path}")


# Backend room snapshots identify the host.
replace_once(
    "backend/src/types/contracts.ts",
    "  roomId: string;\n  code: string;\n  phase:",
    "  roomId: string;\n  code: string;\n  hostUserId: string;\n  phase:",
)
replace_once(
    "backend/src/socket/handlers/playerReady.ts",
    "    roomId: room.id,\n    code: room.code,\n    phase:",
    "    roomId: room.id,\n    code: room.code,\n    hostUserId: room.hostUserId,\n    phase:",
)
replace_once(
    "backend/src/services/RoomService.ts",
    "        roomId: room.id,\n        code: room.code,\n        phase:",
    "        roomId: room.id,\n        code: room.code,\n        hostUserId: room.hostUserId,\n        phase:",
)

# Failed game starts restore the authoritative WAITING snapshot to all clients.
replace_once(
    "backend/src/services/GameOrchestrator.ts",
    "      emitRoomEnvelope(io, roomId, {\n        type: \"error\",",
    "      const recoveredRoom = await roomService.getRoomById(roomId).catch(() => null);\n"
    "      if (recoveredRoom) {\n"
    "        emitRoomEnvelope(io, roomId, {\n"
    "          type: \"room:state_sync\",\n"
    "          version: \"v1\",\n"
    "          payload: { room: recoveredRoom.room }\n"
    "        });\n"
    "      }\n\n"
    "      emitRoomEnvelope(io, roomId, {\n        type: \"error\",",
)
replace_once(
    "backend/src/socket/registerHandlers.ts",
    "    io.to(roomId).emit(\"message\", {\n      type: \"error\",",
    "    const recoveredRoom = await roomService.getRoomById(roomId).catch(() => null);\n"
    "    if (recoveredRoom) {\n"
    "      io.to(roomId).emit(\"message\", {\n"
    "        type: \"room:state_sync\",\n"
    "        version: \"v1\",\n"
    "        payload: { room: recoveredRoom.room }\n"
    "      } satisfies ServerEvents);\n"
    "    }\n\n"
    "    io.to(roomId).emit(\"message\", {\n      type: \"error\",",
)

# Railway startup ensures built-in active questions exist.
replace_once(
    "backend/start.sh",
    'fi\n\necho "Starting server..."',
    'fi\n\n'
    'SEED_TIMEOUT_SECONDS="${SEED_TIMEOUT_SECONDS:-60}"\n'
    'echo "Ensuring the production question bank is ready..."\n'
    'if timeout "$SEED_TIMEOUT_SECONDS" node dist/scripts/seed.js; then\n'
    '  echo "Question bank is ready."\n'
    'else\n'
    '  seed_status=$?\n'
    '  echo "WARNING: Database seed check failed with exit code ${seed_status}."\n'
    '  echo "The server will start, but game starts may fail until active questions exist."\n'
    'fi\n\n'
    'echo "Starting server..."',
)
replace_once(
    "backend/src/scripts/seed.ts",
    "  const count = await prisma.questionBank.count();",
    "  const count = await prisma.questionBank.count({ where: { isActive: true } });",
)
replace_once(
    "backend/src/scripts/seed.ts",
    "    if (!existing) {\n"
    "      await prisma.questionBank.create({\n"
    "        data: { id: ulid(), ...q, isActive: true }\n"
    "      });\n"
    "    }",
    "    if (!existing) {\n"
    "      await prisma.questionBank.create({\n"
    "        data: { id: ulid(), ...q, isActive: true }\n"
    "      });\n"
    "    } else if (!existing.isActive) {\n"
    "      await prisma.questionBank.update({\n"
    "        where: { id: existing.id },\n"
    "        data: { isActive: true }\n"
    "      });\n"
    "    }",
)

# Web contract and store carry host identity.
replace_once(
    "webapp/src/lib/contracts.ts",
    "  roomId: z.string(),\n  code: z.string(),\n  phase:",
    "  roomId: z.string(),\n  code: z.string(),\n  hostUserId: z.string(),\n  phase:",
)
replace_once(
    "webapp/src/stores/gameStore.ts",
    "  roomId: string | null;\n  code: string | null;\n  phase:",
    "  roomId: string | null;\n  code: string | null;\n  hostUserId: string | null;\n  phase:",
)
replace_once(
    "webapp/src/stores/gameStore.ts",
    "  roomId: null,\n  code: null,\n  phase:",
    "  roomId: null,\n  code: null,\n  hostUserId: null,\n  phase:",
)
replace_once(
    "webapp/src/stores/gameStore.ts",
    "      roomId: payload.room.roomId,\n      code: payload.room.code,\n      phase:",
    "      roomId: payload.room.roomId,\n      code: payload.room.code,\n      hostUserId: payload.room.hostUserId,\n      phase:",
)

# Web lobby: host badge, host-only controls, and explicit modes.
replace_once(
    "webapp/src/pages/LobbyPage.tsx",
    "  const accessToken = useAuthStore((state) => state.accessToken);",
    "  const accessToken = useAuthStore((state) => state.accessToken);\n"
    "  const userId = useAuthStore((state) => state.user?.id ?? null);",
)
replace_once(
    "webapp/src/pages/LobbyPage.tsx",
    "  const code = useGameStore((state) => state.code);\n"
    "  const phase = useGameStore((state) => state.phase);",
    "  const code = useGameStore((state) => state.code);\n"
    "  const hostUserId = useGameStore((state) => state.hostUserId);\n"
    "  const phase = useGameStore((state) => state.phase);",
)
replace_once(
    "webapp/src/pages/LobbyPage.tsx",
    "  const hasMultiplePlayers = players.length >= 2;\n"
    "  const resetRoom = useGameStore((state) => state.resetRoom);",
    "  const hasMultiplePlayers = players.length >= 2;\n"
    "  const isHost = Boolean(userId && hostUserId === userId);\n"
    "  const hostPlayer = players.find((player) => player.id === hostUserId);\n"
    "  const hostName = hostPlayer?.displayName ?? 'the room host';\n"
    "  const resetRoom = useGameStore((state) => state.resetRoom);",
)
replace_once(
    "webapp/src/pages/LobbyPage.tsx",
    "    if (!roomId) return;",
    "    if (!roomId || !isHost) return;",
)
replace_once(
    "webapp/src/pages/LobbyPage.tsx",
    "      // allowSolo makes this a true manual override: the host may start with\n"
    "      // one player, two players, or any larger room size.\n"
    "      await api.post(`/rooms/${roomId}/start`, { allowSolo: true });",
    "      await api.post(`/rooms/${roomId}/start`, { allowSolo: !hasMultiplePlayers });",
)
replace_once(
    "webapp/src/pages/LobbyPage.tsx",
    "  }, [hasMultiplePlayers, mountedRef, roomId]);",
    "  }, [hasMultiplePlayers, isHost, mountedRef, roomId]);",
)
replace_once(
    "webapp/src/pages/LobbyPage.tsx",
    "            {players.map((player) => (\n"
    "              <PlayerAvatar key={player.id} player={player} />\n"
    "            ))}",
    "            {players.map((player) => (\n"
    "              <div key={player.id} className=\"relative\">\n"
    "                {player.id === hostUserId && (\n"
    "                  <span className=\"absolute right-3 top-3 z-10 rounded-full bg-brand-gold px-3 py-1 text-[10px] font-black uppercase tracking-widest text-black\">\n"
    "                    Host\n"
    "                  </span>\n"
    "                )}\n"
    "                <PlayerAvatar player={player} />\n"
    "              </div>\n"
    "            ))}",
)

lobby_controls = '''          <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">
                  Game Controls
                </p>
                <span className="rounded-full border border-brand-gold/40 bg-brand-gold/10 px-3 py-1 text-xs font-bold text-brand-gold">
                  {isHost ? 'You are Host' : `${hostName} is Host`}
                </span>
              </div>

              {isHost ? (
                phase === 'WAITING' ? (
                  <>
                    <p className="mt-4 text-lg font-bold text-white">
                      {hasMultiplePlayers ? 'Multiplayer Mode' : 'Single Player Mode'}
                    </p>
                    <p className="mt-2 text-sm text-white/70">
                      {hasMultiplePlayers
                        ? `${players.length} players are connected. Start now without waiting for automatic launch.`
                        : 'Play all ten trivia rounds by yourself. You can also invite friends before starting.'}
                    </p>
                    <button
                      type="button"
                      disabled={isStarting}
                      onClick={() => void handleStartGame()}
                      className="mt-5 w-full rounded-2xl bg-brand-gold px-4 py-4 text-sm font-black uppercase tracking-widest text-black shadow-royale transition hover:opacity-90 disabled:opacity-40"
                    >
                      {isStarting
                        ? 'Starting...'
                        : hasMultiplePlayers
                          ? 'Start Multiplayer'
                          : 'Play Solo'}
                    </button>
                  </>
                ) : (
                  <p className="mt-4 text-sm text-white/70">
                    {phaseCopy[phase] ?? phase}. Game controls will return if startup fails.
                  </p>
                )
              ) : (
                <>
                  <p className="mt-4 text-lg font-bold text-white">Waiting for the host</p>
                  <p className="mt-2 text-sm text-white/70">
                    {hostName} can start the game. Host-only controls are hidden from other players.
                  </p>
                </>
              )}

              {startNotice && <p className="mt-3 text-sm text-brand-gold">{startNotice}</p>}
              {startError && <p className="mt-3 text-sm text-answer-wrong">{startError}</p>}
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">
                Invite Players
              </p>
              <p className="mt-3 text-sm text-white/70">
                Share code <span className="font-mono font-bold text-white">{displayCode}</span> or send a link that loads this room code.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={!canRecoverSession}
                  onClick={() => void copyInvite()}
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/30 disabled:opacity-40"
                >
                  Copy Invite
                </button>
                <button
                  type="button"
                  disabled={!canRecoverSession}
                  onClick={() => void copyInvite('Friends invite')}
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/30 disabled:opacity-40"
                >
                  Copy for Friends
                </button>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  placeholder="friend@email.com"
                  className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white placeholder-white/35 outline-none transition focus:border-brand"
                />
                <button
                  type="button"
                  disabled={!canRecoverSession}
                  onClick={emailInvite}
                  className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black transition hover:opacity-90 disabled:opacity-40"
                >
                  Email Invite
                </button>
              </div>

              {inviteNotice && <p className="mt-3 text-sm text-brand-gold">{inviteNotice}</p>}
              {inviteError && <p className="mt-3 text-sm text-answer-wrong">{inviteError}</p>}
            </div>
          </div>
'''
replace_between(
    "webapp/src/pages/LobbyPage.tsx",
    "          {phase === 'WAITING' && (\n",
    "        </section>",
    lobby_controls,
)

# Single Player is visible on Home.
replace_once(
    "webapp/src/pages/HomePage.tsx",
    "  const createRoom = async (isPrivate: boolean) => {\n"
    "    setLoading(isPrivate ? 'private' : 'create');",
    "  const createRoom = async (\n"
    "    isPrivate: boolean,\n"
    "    action = isPrivate ? 'private' : 'create',\n"
    "  ) => {\n"
    "    setLoading(action);",
)
replace_once(
    "webapp/src/pages/HomePage.tsx",
    "        <button\n          onClick={() => createRoom(true)}",
    "        <button\n"
    "          onClick={() => createRoom(true, 'solo')}\n"
    "          disabled={!!loading}\n"
    "          className=\"w-full py-4 rounded-2xl bg-brand-gold text-black font-black text-lg shadow-royale hover:opacity-90 disabled:opacity-60\"\n"
    "        >\n"
    "          {loading === 'solo' ? 'Creating solo game...' : 'Single Player'}\n"
    "        </button>\n"
    "        <p className=\"-mt-2 text-center text-xs text-game-muted\">\n"
    "          Create a private lobby, then tap Play Solo.\n"
    "        </p>\n\n"
    "        <button\n          onClick={() => createRoom(true)}",
)

Path("webapp/src/pages/LobbyPage.test.tsx").write_text('''import React from 'react';
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
''')
print("updated web lobby tests")

# Android supports host identification and solo start.
replace_once(
    "android/app/src/main/java/com/quizroyale/showdown/data/room/RoomModels.kt",
    "@Serializable\n"
    "data class JoinRoomRequest(\n"
    "    val roomCode: String? = null,\n"
    ")\n",
    "@Serializable\n"
    "data class JoinRoomRequest(\n"
    "    val roomCode: String? = null,\n"
    ")\n\n"
    "@Serializable\n"
    "data class StartGameRequest(\n"
    "    val allowSolo: Boolean = false,\n"
    ")\n",
)
replace_once(
    "android/app/src/main/java/com/quizroyale/showdown/data/room/RoomApi.kt",
    "    @POST(\"rooms/{roomId}/start\")\n"
    "    suspend fun startGame(@Path(\"roomId\") roomId: String): JsonObject",
    "    @POST(\"rooms/{roomId}/start\")\n"
    "    suspend fun startGame(\n"
    "        @Path(\"roomId\") roomId: String,\n"
    "        @Body request: StartGameRequest,\n"
    "    ): JsonObject",
)
replace_once(
    "android/app/src/main/java/com/quizroyale/showdown/data/room/RoomRepository.kt",
    "    suspend fun startGame(roomId: String) {\n"
    "        roomApi.startGame(roomId)\n"
    "    }",
    "    suspend fun startGame(roomId: String, allowSolo: Boolean = false) {\n"
    "        roomApi.startGame(roomId, StartGameRequest(allowSolo = allowSolo))\n"
    "    }",
)
replace_once(
    "android/app/src/main/java/com/quizroyale/showdown/ui/lobby/LobbyViewModel.kt",
    "import com.quizroyale.showdown.data.room.CachedRoomSummary",
    "import com.quizroyale.showdown.data.auth.AuthRepository\n"
    "import com.quizroyale.showdown.data.room.CachedRoomSummary",
)
replace_once(
    "android/app/src/main/java/com/quizroyale/showdown/ui/lobby/LobbyViewModel.kt",
    "data class LobbyUiState(\n    val roomReference: String? = null,",
    "data class LobbyUiState(\n"
    "    val roomReference: String? = null,\n"
    "    val currentUserId: String? = null,",
)
replace_once(
    "android/app/src/main/java/com/quizroyale/showdown/ui/lobby/LobbyViewModel.kt",
    "    private val roomRepository: RoomRepository,\n"
    "    private val webSocketManager: WebSocketManager,",
    "    private val roomRepository: RoomRepository,\n"
    "    private val authRepository: AuthRepository,\n"
    "    private val webSocketManager: WebSocketManager,",
)
replace_once(
    "android/app/src/main/java/com/quizroyale/showdown/ui/lobby/LobbyViewModel.kt",
    "        LobbyUiState(roomReference = requestedRoomReference)",
    "        LobbyUiState(\n"
    "            roomReference = requestedRoomReference,\n"
    "            currentUserId = authRepository.currentUserId(),\n"
    "        )",
)
replace_once(
    "android/app/src/main/java/com/quizroyale/showdown/ui/lobby/LobbyViewModel.kt",
    "    fun startGame() {\n"
    "        val roomId = _uiState.value.room?.roomId ?: return",
    "    fun startGame(allowSolo: Boolean) {\n"
    "        val roomId = _uiState.value.room?.roomId ?: return",
)
replace_once(
    "android/app/src/main/java/com/quizroyale/showdown/ui/lobby/LobbyViewModel.kt",
    "            runCatching { roomRepository.startGame(roomId) }",
    "            runCatching { roomRepository.startGame(roomId, allowSolo = allowSolo) }",
)
replace_once(
    "android/app/src/main/java/com/quizroyale/showdown/ui/lobby/LobbyScreen.kt",
    "    val roomReference = liveRoom?.roomReference ?: cachedRoom?.roomReference\n",
    "    val roomReference = liveRoom?.roomReference ?: cachedRoom?.roomReference\n"
    "    val isHost = liveRoom?.hostUserId != null && liveRoom.hostUserId == uiState.currentUserId\n"
    "    val hostName = liveRoom?.players\n"
    "        ?.firstOrNull { it.id == liveRoom.hostUserId }\n"
    "        ?.displayName\n"
    "        ?: \"the room host\"\n",
)
replace_once(
    "android/app/src/main/java/com/quizroyale/showdown/ui/lobby/LobbyScreen.kt",
    "                                    append(player.score)\n"
    "                                    append(\" pts\")",
    "                                    append(player.score)\n"
    "                                    append(\" pts\")\n"
    "                                    if (player.id == liveRoom.hostUserId) {\n"
    "                                        append(\" - Host\")\n"
    "                                    }",
)

android_controls = '''        liveRoom?.let { room ->
            ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text("Game Controls", style = MaterialTheme.typography.titleMedium)
                    Text(
                        text = if (isHost) "You are the host" else "$hostName is the host",
                        style = MaterialTheme.typography.bodyMedium,
                    )

                    if (room.phase == "WAITING" && isHost) {
                        val isSolo = room.totalPlayers == 1
                        Text(
                            text = if (isSolo) "Single Player Mode" else "Multiplayer Mode",
                            style = MaterialTheme.typography.titleLarge,
                        )
                        Button(
                            onClick = { viewModel.startGame(allowSolo = isSolo) },
                            enabled = !uiState.isStartingGame,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            if (uiState.isStartingGame) {
                                CircularProgressIndicator(strokeWidth = 2.dp, color = Color.White)
                            } else {
                                Text(if (isSolo) "Play Solo" else "Start Multiplayer")
                            }
                        }
                    } else if (!isHost) {
                        Text(
                            text = "Waiting for $hostName to start the game.",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.Gray,
                        )
                    } else {
                        Text(
                            text = "Phase ${room.phase}. The game is starting or already in progress.",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.Gray,
                        )
                    }
                }
            }
        }

'''
replace_between(
    "android/app/src/main/java/com/quizroyale/showdown/ui/lobby/LobbyScreen.kt",
    '        if (liveRoom?.phase == "WAITING") {\n',
    "        Row(\n            modifier = Modifier.fillMaxWidth(),",
    android_controls,
)

print("all host/start/solo fixes applied")
