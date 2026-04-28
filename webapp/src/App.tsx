import React, { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ReconnectBanner } from '@/components/ReconnectBanner';
import { GamePage } from '@/pages/GamePage';
import { LobbyPage } from '@/pages/LobbyPage';
import { useAuthStore } from '@/stores/authStore';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/RegisterPage'));
const HomePage = lazy(() => import('@/pages/HomePage'));
const ResultsPage = lazy(() => import('@/pages/ResultsPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const LeaderboardPage = lazy(() => import('@/pages/LeaderboardPage'));
const CosmeticsPage = lazy(() => import('@/pages/CosmeticsPage'));
const FriendsPage = lazy(() => import('@/pages/FriendsPage'));
const JoinPage = lazy(() => import('@/pages/JoinPage'));

const Spinner = () => (
  <div className="min-h-screen bg-game-bg flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
  </div>
);

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const authResolved = useAuthStore((state) => state.authResolved);

  if (!authResolved) return <Spinner />;
  if (!user || !accessToken) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const authResolved = useAuthStore((state) => state.authResolved);

  if (!authResolved) return <Spinner />;
  if (user && accessToken) return <Navigate to="/home" replace />;

  return <>{children}</>;
}

function RootRedirect() {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const authResolved = useAuthStore((state) => state.authResolved);

  if (!authResolved) return <Spinner />;

  return <Navigate to={user && accessToken ? '/home' : '/login'} replace />;
}

export const App = () => {
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const bootstrapSession = useAuthStore((state) => state.bootstrapSession);

  useEffect(() => {
    if (!hasHydrated) return;
    void bootstrapSession();
  }, [bootstrapSession, hasHydrated]);

  if (!hasHydrated) {
    return <Spinner />;
  }

  return (
    <ErrorBoundary>
    <ReconnectBanner />
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
        <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
        <Route path="/join/:inviteCode" element={<JoinPage />} />

        <Route path="/home" element={<RequireAuth><HomePage /></RequireAuth>} />
        <Route path="/lobby/:roomId" element={<RequireAuth><LobbyPage /></RequireAuth>} />
        <Route path="/game/:roomId" element={<RequireAuth><GamePage /></RequireAuth>} />
        <Route path="/results/:roomId" element={<RequireAuth><ResultsPage /></RequireAuth>} />
        <Route path="/profile/:username" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="/leaderboard" element={<RequireAuth><LeaderboardPage /></RequireAuth>} />
        <Route path="/cosmetics" element={<RequireAuth><CosmeticsPage /></RequireAuth>} />
        <Route path="/friends" element={<RequireAuth><FriendsPage /></RequireAuth>} />

        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </Suspense>
    </ErrorBoundary>
  );
};
