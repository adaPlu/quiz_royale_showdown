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
const NotFoundPage    = lazy(() => import('@/pages/NotFoundPage'));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
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
        <OfflineBanner />
        <SocketReconnectBanner />
        <ToastManager />
        <Routes>
          {/* Public */}
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Auth-gated */}
          <Route path="/home" element={<RequireAuth><HomePage /></RequireAuth>} />
          <Route path="/lobby/:roomId" element={<RequireAuth><LobbyPage /></RequireAuth>} />
          <Route path="/game/:roomId"  element={<RequireAuth><GamePage /></RequireAuth>} />
          <Route path="/results/:roomId" element={<RequireAuth><ResultsPage /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
          <Route path="/profile/:username" element={<RequireAuth><ProfilePage /></RequireAuth>} />
          <Route path="/leaderboard" element={<RequireAuth><LeaderboardPage /></RequireAuth>} />

          {/* Root redirect */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          {/* 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
};
