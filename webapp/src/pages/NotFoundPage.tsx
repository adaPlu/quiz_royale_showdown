import { useNavigate } from 'react-router-dom';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-game-bg px-4 text-center">
      <p className="text-7xl font-black text-brand">404</p>
      <h1 className="text-2xl font-black text-white">Page not found</h1>
      <p className="text-sm text-game-muted">This page doesn't exist or you don't have access.</p>
      <button
        onClick={() => navigate('/home')}
        className="mt-2 rounded-xl bg-brand px-6 py-3 font-bold text-white shadow-royale hover:opacity-90"
      >
        Back to Home
      </button>
    </div>
  );
}
