import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore } from '@stores/gameStore';
import { useAuthStore } from '@stores/authStore';
import { PlayerAvatar } from '@components/PlayerAvatar';
import { socketService } from '@services/socketService';

export default function ResultsPage() {
  const navigate = useNavigate();
  const { roomId: _roomId } = useParams<{ roomId: string }>();
  const user = useAuthStore((s) => s.user);
  const finalScores = useGameStore((s) => s.finalScores);
  const winnerId = useGameStore((s) => s.winnerId);
  const players = useGameStore((s) => s.players);
  const resetRoom = useGameStore((s) => s.resetRoom);

  useEffect(() => { return () => resetRoom(); }, [resetRoom]);

  const returnHome = () => {
    socketService.disconnect(true);
    resetRoom();
    navigate('/home', { replace: true });
  };

  if (!finalScores || finalScores.length === 0) {
    return (
      <div className="min-h-screen bg-game-bg flex items-center justify-center">
        <p className="text-game-muted">No results available.</p>
      </div>
    );
  }

  const myScore = finalScores.find((s) => s.playerId === user?.id);
  const winner = finalScores.find((s) => s.playerId === winnerId);
  const winnerPlayer = players.find((p) => p.id === winnerId);
  const winnerName = winnerPlayer?.displayName ?? winnerId;

  return (
    <div className="min-h-screen bg-game-bg flex flex-col p-4">
      <div className="max-w-lg mx-auto w-full flex flex-col gap-4 py-6">
        <div className="text-center">
          <p className="text-5xl mb-2">
            {myScore?.rank === 1 ? '🏆' : myScore?.rank === 2 ? '🥈' : myScore?.rank === 3 ? '🥉' : '🎮'}
          </p>
          <h1 className="text-white text-3xl font-black">Game Over!</h1>
          {winner && <p className="text-gold font-semibold mt-1">Winner: {winnerName}</p>}
          {myScore && <p className="text-game-muted text-sm">Your rank: #{myScore.rank}</p>}
        </div>

        {myScore && myScore.xpAwarded > 0 && (
          <div className="bg-game-surface rounded-2xl p-4 text-center border border-game-border">
            <p className="text-game-muted text-xs uppercase tracking-wide">XP Earned</p>
            <p className="text-gold text-3xl font-black">+{myScore.xpAwarded} XP</p>
          </div>
        )}

        <div className="bg-game-surface rounded-2xl border border-game-border overflow-hidden">
          <div className="px-4 py-3 border-b border-game-border">
            <h2 className="text-white font-bold">Final Standings</h2>
          </div>
          <div className="divide-y divide-game-border">
            {finalScores.map((s, i) => (
              <div
                key={s.playerId}
                className={`flex items-center gap-3 px-4 py-3 ${s.playerId === user?.id ? 'bg-brand/10' : ''}`}
              >
                <span className="text-lg w-8 text-center">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </span>
                <PlayerAvatar username={players.find((p) => p.id === s.playerId)?.displayName ?? s.playerId} size="xs" />
                <span className="flex-1 text-white text-sm font-medium truncate">
                  {players.find((p) => p.id === s.playerId)?.displayName ?? s.playerId}{s.playerId === user?.id ? ' (you)' : ''}
                </span>
                <span className="text-white font-bold text-sm tabular-nums">
                  {s.score.toLocaleString()}
                </span>
                {s.xpAwarded > 0 && (
                  <span className="text-gold text-xs">+{s.xpAwarded}xp</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={returnHome}
            className="flex-1 py-3 rounded-xl border border-game-border text-white font-semibold hover:bg-game-surface"
          >
            Home
          </button>
          <button
            onClick={returnHome}
            className="flex-1 py-3 rounded-xl bg-brand text-white font-bold shadow-royale hover:opacity-90"
          >
            Play Again
          </button>
        </div>
      </div>
    </div>
  );
}
