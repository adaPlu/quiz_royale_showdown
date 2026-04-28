import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PlayerAvatar } from '@components/PlayerAvatar';
import { api } from '@services/apiClient';
import { socketService } from '@services/socketService';
import { useAuthStore } from '@stores/authStore';

type RoomApiRecord = {
  id?: unknown;
  roomId?: unknown;
  code?: unknown;
  roomCode?: unknown;
};

type RoomFlowResponse = {
  room?: RoomApiRecord;
  roomId?: unknown;
  code?: unknown;
  roomCode?: unknown;
  wsToken?: unknown;
};

type RoomSession = {
  roomId: string;
  roomCode: string;
  wsToken?: string;
};

const normalizeRoomSession = (data: unknown, fallbackRoomCode?: string): RoomSession => {
  const payload = (data ?? {}) as RoomFlowResponse;
  const room = payload.room ?? {};

  const roomIdCandidate = room.id ?? room.roomId ?? payload.roomId;
  if (typeof roomIdCandidate !== 'string' || !roomIdCandidate.trim()) {
    throw new Error('Room response is missing roomId');
  }

  const roomCodeCandidate =
    room.code ??
    room.roomCode ??
    payload.code ??
    payload.roomCode ??
    fallbackRoomCode ??
    roomIdCandidate;

  if (typeof roomCodeCandidate !== 'string' || !roomCodeCandidate.trim()) {
    throw new Error('Room response is missing roomCode');
  }

  return {
    roomId: roomIdCandidate,
    roomCode: roomCodeCandidate.trim().toUpperCase(),
    wsToken: typeof payload.wsToken === 'string' && payload.wsToken.trim() ? payload.wsToken : undefined,
  };
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export default function HomePage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launchNotice, setLaunchNotice] = useState<string | null>(null);

  const installPromptRef = useRef<any>(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      installPromptRef.current = e;
      setShowInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installPromptRef.current) return;
    installPromptRef.current.prompt();
    await installPromptRef.current.userChoice;
    installPromptRef.current = null;
    setShowInstall(false);
  };

  const enterLobby = (session: RoomSession) => {
    const socketToken = session.wsToken ?? accessToken;
    if (!socketToken) {
      throw new Error('Missing websocket auth token');
    }

    socketService.connect(socketToken);
    socketService.setActiveRoom({
      roomId: session.roomId,
      roomCode: session.roomCode,
      token: socketToken,
    });
    socketService.joinRoom(session.roomCode, session.roomId);

    navigate(`/lobby/${session.roomId}`);
  };

  const quickPlay = async () => {
    setLoading('quick');
    setError(null);
    setLaunchNotice(null);

    try {
      const response = await api.post('/rooms/join', { roomCode: null });
      enterLobby(normalizeRoomSession(response.data));
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to find a room'));
    } finally {
      setLoading(null);
    }
  };

  const createRoom = async (isPrivate: boolean) => {
    setLoading(isPrivate ? 'private' : 'create');
    setError(null);
    setLaunchNotice(null);

    try {
      const response = await api.post('/rooms', { isPrivate, maxPlayers: 8 });
      enterLobby(normalizeRoomSession(response.data));
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create room'));
    } finally {
      setLoading(null);
    }
  };

  const joinByCode = async () => {
    const normalizedCode = code.trim().toUpperCase();
    if (normalizedCode.length < 4) {
      return;
    }

    setLoading('join');
    setError(null);
    setLaunchNotice(null);

    try {
      const response = await api.post('/rooms/join', { roomCode: normalizedCode });
      enterLobby(normalizeRoomSession(response.data, normalizedCode));
    } catch (err) {
      setError(getErrorMessage(err, 'Room not found'));
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-game-bg flex flex-col">
      <header className="px-4 py-4 flex items-center justify-between border-b border-game-border">
        <div className="flex items-center gap-3">
          <PlayerAvatar username={user?.username ?? '?'} size="sm" />
          <div>
            <p className="text-white font-semibold text-sm">{user?.username}</p>
            <p className="text-game-muted text-xs">Level {user?.level ?? 1}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/friends"
            className="text-game-muted hover:text-white text-sm transition"
          >
            Friends
          </Link>
          <button
            type="button"
            onClick={() => setLaunchNotice('Profiles are local-only during launch and do not call the backend yet.')}
            className="text-game-muted hover:text-white text-sm"
          >
            Profile
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center gap-4 px-4 max-w-sm mx-auto w-full">
        <h1 className="text-white text-3xl font-black text-center">Ready to Play?</h1>

        <button
          onClick={quickPlay}
          disabled={!!loading}
          className="w-full py-4 rounded-2xl bg-brand text-white font-bold text-lg shadow-royale hover:opacity-90 disabled:opacity-60"
        >
          {loading === 'quick' ? 'Finding game...' : 'Quick Play'}
        </button>

        <button
          onClick={() => createRoom(true)}
          disabled={!!loading}
          className="w-full py-3 rounded-2xl bg-game-surface border border-game-border text-white font-semibold hover:border-brand/50 disabled:opacity-60"
        >
          {loading === 'private' ? 'Creating...' : 'Create Private Room'}
        </button>

        <div className="w-full border-t border-game-border pt-4">
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 8))}
              placeholder="Room Code"
              className="flex-1 bg-game-card border border-game-border rounded-xl px-4 py-3 text-white placeholder-game-muted focus:outline-none focus:border-brand uppercase tracking-widest font-mono"
            />
            <button
              onClick={joinByCode}
              disabled={code.trim().length < 4 || !!loading}
              className="px-4 py-3 rounded-xl bg-brand/20 border border-brand/40 text-brand font-semibold hover:bg-brand/30 disabled:opacity-40"
            >
              Join
            </button>
          </div>
        </div>

        {error && <p className="text-answer-wrong text-sm text-center">{error}</p>}
        {launchNotice && <p className="text-game-muted text-sm text-center">{launchNotice}</p>}

        <div className="flex gap-3 w-full pt-2">
          <button
            type="button"
            onClick={() => setLaunchNotice('Global leaderboard is disabled for launch; in-game standings appear once a room starts.')}
            className="flex-1 py-2 rounded-xl border border-game-border text-game-muted text-sm hover:text-white hover:border-white/30"
          >
            Leaderboard
          </button>
        </div>

        {showInstall && (
          <button
            type="button"
            onClick={() => void handleInstall()}
            className="text-sm text-white/60 underline"
          >
            Install App
          </button>
        )}
      </main>
    </div>
  );
}
