import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PlayerAvatar } from '@components/PlayerAvatar';
import { useAuthStore } from '@stores/authStore';
import { useGameStore } from '@stores/gameStore';

export default function ResultsPage() {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const user = useAuthStore((state) => state.user);
  const finalScores = useGameStore((state) => state.finalScores);
  const winnerId = useGameStore((state) => state.winnerId);
  const resetRoom = useGameStore((state) => state.resetRoom);

  useEffect(() => {
    return () => resetRoom();
  }, [resetRoom]);

  if (finalScores.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-game-bg px-4">
        <div className="max-w-sm rounded-3xl border border-game-border bg-game-surface p-6 text-center">
          <h1 className="text-2xl font-black text-white">No results available</h1>
          <p className="mt-2 text-sm text-game-muted">
            Results are available immediately after a live game ends{roomId ? ` for room ${roomId}` : ''}.
          </p>
          <button
            onClick={() => navigate('/home')}
            className="mt-5 rounded-xl bg-brand px-5 py-3 font-bold text-white shadow-royale"
          >
            Back Home
          </button>
        </div>
      </div>
    );
  }

  const myScore = finalScores.find((score) => score.playerId === user?.id);
  const winner = finalScores.find((score) => score.playerId === winnerId);

  return (
    <div className="flex min-h-screen flex-col bg-game-bg p-4">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 py-6">
        <div className="text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-gold">Game Over</p>
          <h1 className="mt-2 text-3xl font-black text-white">
            {myScore?.rank === 1 ? 'Victory' : 'Final Results'}
          </h1>
          {winner && <p className="mt-1 font-semibold text-gold">Winner: {winner.playerId}</p>}
          {myScore && <p className="text-sm text-game-muted">Your rank: #{myScore.rank}</p>}
        </div>

        {myScore && myScore.xpAwarded > 0 && (
          <div className="rounded-2xl border border-game-border bg-game-surface p-4 text-center">
            <p className="text-xs uppercase tracking-wide text-game-muted">XP Earned</p>
            <p className="text-3xl font-black text-gold">+{myScore.xpAwarded} XP</p>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-game-border bg-game-surface">
          <div className="border-b border-game-border px-4 py-3">
            <h2 className="font-bold text-white">Final Standings</h2>
          </div>
          <div className="divide-y divide-game-border">
            {finalScores.map((score) => (
              <div
                key={score.playerId}
                className={`flex items-center gap-3 px-4 py-3 ${score.playerId === user?.id ? 'bg-brand/10' : ''}`}
              >
                <span className="w-8 text-center font-bold text-game-muted">#{score.rank}</span>
                <PlayerAvatar username={score.playerId} size="xs" />
                <span className="flex-1 truncate text-sm font-medium text-white">
                  {score.playerId}{score.playerId === user?.id ? ' (you)' : ''}
                </span>
                <span className="text-sm font-bold tabular-nums text-white">
                  {score.score.toLocaleString()}
                </span>
                {score.xpAwarded > 0 && (
                  <span className="text-xs text-gold">+{score.xpAwarded}xp</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => navigate('/home')}
            className="flex-1 rounded-xl border border-game-border py-3 font-semibold text-white hover:bg-game-surface"
          >
            Home
          </button>
          <button
            onClick={() => navigate('/home')}
            className="flex-1 rounded-xl bg-brand py-3 font-bold text-white shadow-royale hover:opacity-90"
          >
            Play Again
          </button>
        </div>
      </div>
    </div>
  );
}
