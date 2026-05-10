import React, { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OfflineBanner } from '@/components/OfflineBanner';
import { SocketReconnectBanner } from '@/components/SocketReconnectBanner';
import { ToastManager } from '@/components/ToastManager';
import { GamePage } from '@/pages/GamePage';
import { LobbyPage } from '@/pages/LobbyPage';
import { useAuthStore } from '@/stores/authStore';

const LoginPage       = lazy(() => import('@/pages/LoginPage'));
const RegisterPage    = lazy(() => import('@/pages/RegisterPage'));
const HomePage        = lazy(() => import('@/pages/HomePage'));
const ResultsPage     = lazy(() => import('@/pages/ResultsPage'));
const ProfilePage     = lazy(() => import('@/pages/ProfilePage'));
const LeaderboardPage = lazy(() => import('@/pages/LeaderboardPage'));
const FriendsPage     = lazy(() => import('@/pages/FriendsPage'));
const NotFoundPage    = lazy(() => import('@/pages/NotFoundPage'));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  if (isInitializing) return <div className="flex h-screen items-center justify-center"><span className="text-white">Loading…</span></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AuthErrorBanner() {
  const authError = useAuthStore((s) => s.authError);
  const clearAuthError = useAuthStore((s) => s.clearAuthError);
  if (!authError) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-answer-wrong px-4 py-2 text-center text-sm text-white">
      {authError}
      <button className="ml-3 underline" onClick={clearAuthError}>Dismiss</button>
    </div>
  );
}

const Spinner = () => (
  <div className="min-h-screen bg-game-bg flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
  </div>
);

export const App = () => {
  useEffect(() => {
    void useAuthStore.getState().initAuth();
  }, []);

  return (
    <ErrorBoundary>
      <Suspense fallback={<Spinner />}>
        <AuthErrorBanner />
        <OfflineBanner />
        <SocketReconnectBanner />
        <ToastManager />
        <Routes>
          {/* Public */}
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Auth-gated */}
          <Route path="/home" element={<RequireAuth><HomePage /></RequireAuth>} />
          <Route path="/lobby/:roomId" element={<RequireAuth><ErrorBoundary key="lobby-page"><LobbyPage /></ErrorBoundary></RequireAuth>} />
          <Route path="/game/:roomId"  element={<RequireAuth><ErrorBoundary key="game-page"><GamePage /></ErrorBoundary></RequireAuth>} />
          <Route path="/results/:roomId" element={<RequireAuth><ErrorBoundary key="results-page"><ResultsPage /></ErrorBoundary></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
          <Route path="/profile/:username" element={<RequireAuth><ProfilePage /></RequireAuth>} />
          <Route path="/leaderboard" element={<RequireAuth><LeaderboardPage /></RequireAuth>} />
          <Route path="/friends" element={<RequireAuth><FriendsPage /></RequireAuth>} />

          {/* Root redirect */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          {/* 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
};
