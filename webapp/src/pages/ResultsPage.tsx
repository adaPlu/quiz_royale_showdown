import React, { useEffect } from 'react';
import { useNavigate, useParams } from '../navigation';
import { useGameStore } from '@stores/gameStore';
import { useAuthStore } from '@stores/authStore';
import { PlayerAvatar } from '@components/PlayerAvatar';
import { socketService } from '@services/socketService';
import { resolvePlayerName } from '@/utils/playerNames';

export default function ResultsPage() {
  const navigate = useNavigate();
  const { roomId: _roomId } = useParams<{ roomId: string }>();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const finalScores = useGameStore((s) => s.finalScores);
  const winnerId = useGameStore((s) => s.winnerId);
  const winnerIds = useGameStore((s) => s.winnerIds);
  const winnerPowerUpRewards = useGameStore((s) => s.winnerPowerUpRewards);
  const resetRoom = useGameStore((s) => s.resetRoom);

  useEffect(() => () => resetRoom(), [resetRoom]);

  const returnHome = () => {
    socketService.disconnect(true);
    resetRoom();
    if (user?.isGuest) {
      clearAuth();
      navigate('/login', { replace: true });
    } else {
      navigate('/home', { replace: true });
    }
  };

  if (!finalScores.length) {
    return <div className="min-h-screen bg-game-bg flex items-center justify-center"><p className="text-game-muted">No results available.</p></div>;
  }

  const myScore = finalScores.find((score) => score.playerId === user?.id);
  const myReward = winnerPowerUpRewards.find((reward) => reward.playerId === user?.id);
  const winner = finalScores.find((score) => score.playerId === winnerId) ?? finalScores[0];
  const winnerName = resolvePlayerName(winner?.displayName, winner?.playerId ?? 'winner');
  const winnerNames = winnerIds
    .map((id) => finalScores.find((standing) => standing.playerId === id))
    .filter((standing): standing is NonNullable<typeof standing> => Boolean(standing))
    .map((standing) => resolvePlayerName(standing.displayName, standing.playerId));

  return (
    <div className="min-h-screen bg-game-bg flex flex-col p-4">
      <div className="max-w-lg mx-auto w-full flex flex-col gap-4 py-6">
        <div className="text-center">
          <p className="text-5xl mb-2">{myScore?.rank === 1 ? '🏆' : myScore?.rank === 2 ? '🥈' : myScore?.rank === 3 ? '🥉' : '🎮'}</p>
          <h1 className="text-white text-3xl font-black">Game Over!</h1>
          <p className="text-gold font-semibold mt-1">
            {winnerNames.length > 1 ? `Winners: ${winnerNames.join(', ')}` : `Winner: ${winnerNames[0] ?? winnerName}`}
          </p>
          {myScore && <p className="text-game-muted text-sm">Your rank: #{myScore.rank}</p>}
        </div>

        {myScore && myScore.xpAwarded > 0 && <div className="bg-game-surface rounded-2xl p-4 text-center border border-game-border"><p className="text-game-muted text-xs uppercase tracking-wide">XP Earned</p><p className="text-gold text-3xl font-black">+{myScore.xpAwarded} XP</p></div>}

        {myReward && (
          <div className="bg-game-surface rounded-2xl p-4 text-center border border-gold/40">
            <p className="text-game-muted text-xs uppercase tracking-wide">Winner Reward</p>
            <p className="text-gold text-2xl font-black mt-1">+{myReward.quantity} {myReward.name}</p>
            <p className="text-game-muted text-sm mt-1">Added to your power-up inventory.</p>
          </div>
        )}

        <div className="bg-game-surface rounded-2xl border border-game-border overflow-hidden">
          <div className="px-4 py-3 border-b border-game-border"><h2 className="text-white font-bold">Final Standings</h2></div>
          <div className="divide-y divide-game-border">
            {finalScores.map((standing, index) => {
              const playerName = resolvePlayerName(standing.displayName, standing.playerId);
              const reward = winnerPowerUpRewards.find((item) => item.playerId === standing.playerId);
              return <div key={standing.playerId} className={`flex items-center gap-3 px-4 py-3 ${standing.playerId === user?.id ? 'bg-brand/10' : ''}`}>
                <span className="text-lg w-8 text-center">{index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}</span>
                <PlayerAvatar username={playerName} size="xs" />
                <span className="flex-1 text-white text-sm font-medium truncate">{playerName}{standing.playerId === user?.id ? ' (you)' : ''}{reward ? ` · +${reward.quantity} ${reward.name}` : ''}</span>
                <span className="text-white font-bold text-sm tabular-nums">{standing.score.toLocaleString()}</span>
                {standing.xpAwarded > 0 && <span className="text-gold text-xs">+{standing.xpAwarded}xp</span>}
              </div>;
            })}
          </div>
        </div>

        <button onClick={returnHome} className="w-full py-3 rounded-xl bg-brand text-white font-bold shadow-royale hover:opacity-90">
          {user?.isGuest ? 'Join Another Room' : 'Return Home'}
        </button>
      </div>
    </div>
  );
}
