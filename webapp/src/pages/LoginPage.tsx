import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from '../navigation';

import { roomSnapshotSchema } from '@/lib/contracts';
import { api } from '@services/apiClient';
import { socketService } from '@services/socketService';
import { useMountedRef } from '@hooks/useMountedRef';
import { type AuthResponse, useAuthStore } from '@stores/authStore';
import { useGameStore } from '@stores/gameStore';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type FormData = z.infer<typeof schema>;
type RoomFlowResponse = {
  roomId?: string;
  roomCode?: string;
  wsToken?: string;
  room?: unknown;
};

const normalizeCode = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const validCode = (value: string) => value.length === 6 || value.length === 8;

export default function LoginPage() {
  const navigate = useNavigate();
  const mountedRef = useMountedRef();
  const setSession = useAuthStore((state) => state.setSession);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const applyRoomState = useGameStore((state) => state.applyRoomState);
  const invitedCode = normalizeCode(
    typeof window === 'undefined'
      ? ''
      : new URLSearchParams(window.location.search).get('roomCode') ?? '',
  );
  const [guestCode, setGuestCode] = useState(invitedCode);
  const [guestName, setGuestName] = useState('');
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      const response = await api.post<AuthResponse>('/auth/login', {
        email: data.email.trim().toLowerCase(),
        password: data.password,
      });
      if (!mountedRef.current) return;
      setSession(response.data);
      navigate('/home', { replace: true });
    } catch (error: unknown) {
      if (!mountedRef.current) return;
      setError('root', {
        message: error instanceof Error ? error.message : 'Login failed. Check your credentials.',
      });
    }
  };

  const joinAsGuest = async () => {
    const roomCode = normalizeCode(guestCode);
    if (!validCode(roomCode) || guestLoading) return;

    setGuestLoading(true);
    setGuestError(null);
    try {
      const authResponse = await api.post<AuthResponse>('/auth/guest', {
        roomCode,
        displayName: guestName.trim() || undefined,
      });
      if (!mountedRef.current) return;
      setSession(authResponse.data);

      const joinResponse = await api.post<RoomFlowResponse>('/rooms/join', { roomCode });
      const parsedRoom = roomSnapshotSchema.safeParse(joinResponse.data.room);
      const roomId = joinResponse.data.roomId ?? (parsedRoom.success ? parsedRoom.data.roomId : undefined);
      const joinedCode = joinResponse.data.roomCode ?? (parsedRoom.success ? parsedRoom.data.code : roomCode);
      if (!roomId || !joinedCode) throw new Error('Room response is incomplete');

      if (parsedRoom.success) {
        applyRoomState({ room: parsedRoom.data });
      }

      const socketToken = joinResponse.data.wsToken ?? authResponse.data.accessToken;
      socketService.connect(socketToken);
      socketService.setActiveRoom({ roomId, roomCode: joinedCode });
      socketService.joinRoom(joinedCode, roomId);
      navigate(`/lobby/${roomId}`, { replace: true });
    } catch (error: unknown) {
      clearAuth();
      if (mountedRef.current) {
        setGuestError(error instanceof Error ? error.message : 'Unable to join as guest');
      }
    } finally {
      if (mountedRef.current) setGuestLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-game-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-black text-white">Quiz Royale</h1>
          <p className="text-brand font-semibold text-xl">Showdown</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="bg-game-surface rounded-3xl p-6 border border-game-border shadow-royale space-y-4">
          <h2 className="text-white text-xl font-bold text-center">Sign In</h2>
          <div>
            <label htmlFor="login-email" className="block text-xs text-game-muted mb-1">Email</label>
            <input {...register('email')} id="login-email" type="email" autoComplete="email" className="w-full bg-game-card border border-game-border rounded-xl px-4 py-3 text-white placeholder-game-muted focus:outline-none focus:border-brand" placeholder="you@example.com" />
            {errors.email && <p className="text-answer-wrong text-xs mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label htmlFor="login-password" className="block text-xs text-game-muted mb-1">Password</label>
            <input {...register('password')} id="login-password" type="password" autoComplete="current-password" className="w-full bg-game-card border border-game-border rounded-xl px-4 py-3 text-white placeholder-game-muted focus:outline-none focus:border-brand" placeholder="********" />
            {errors.password && <p className="text-answer-wrong text-xs mt-1">{errors.password.message}</p>}
          </div>
          {errors.root && <p className="text-answer-wrong text-sm text-center">{errors.root.message}</p>}
          <button type="submit" disabled={isSubmitting} className="w-full py-3 rounded-xl bg-brand text-white font-bold text-lg shadow-royale disabled:opacity-60">
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
          <p className="text-center text-game-muted text-sm">No account? <Link to="/register" className="text-brand hover:underline font-semibold">Register</Link></p>
        </form>

        <section className="bg-game-surface rounded-3xl p-6 border border-brand/30 shadow-royale space-y-3">
          <h2 className="text-white text-xl font-bold text-center">Play as Guest</h2>
          <p className="text-game-muted text-sm text-center">Enter a room key. No signup is required.</p>
          <input value={guestCode} onChange={(event) => setGuestCode(normalizeCode(event.target.value))} aria-label="Guest room code" placeholder="Room key" className="w-full bg-game-card border border-game-border rounded-xl px-4 py-3 text-white uppercase tracking-widest font-mono focus:outline-none focus:border-brand" />
          <input value={guestName} onChange={(event) => setGuestName(event.target.value.slice(0, 40))} aria-label="Guest display name" placeholder="Display name (optional)" className="w-full bg-game-card border border-game-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand" />
          <button type="button" onClick={() => void joinAsGuest()} disabled={!validCode(guestCode) || guestLoading} className="w-full py-3 rounded-xl bg-brand-gold text-black font-black disabled:opacity-40">
            {guestLoading ? 'Joining...' : 'Join Room as Guest'}
          </button>
          {guestError && <p className="text-answer-wrong text-sm text-center">{guestError}</p>}
        </section>
      </div>
    </div>
  );
}
