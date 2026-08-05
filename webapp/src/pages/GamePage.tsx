import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from '../navigation';

import { CountdownBar } from '@/components/CountdownBar';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { PowerUpTray } from '@/components/PowerUpTray';
import type { PowerupSlot } from '@/components/PowerUpTray';
import { useGameSocket } from '@/hooks/useGameSocket';
import { api } from '@/services/apiClient';
import { socketService } from '@/services/socketService';
import { useAuthStore } from '@/stores/authStore';
import {
  selectLeaderboard,
  useGameStore,
} from '@/stores/gameStore';
import {
  useProfileStore,
  type PowerupInventoryApiItem,
} from '@/stores/profileStore';
import { resolvePlayerName } from '@/utils/playerNames';

// ---------------------------------------------------------------------------
// Answer button colour helpers
// ---------------------------------------------------------------------------
const ANSWER_LABELS = ['A', 'B', 'C', 'D'];

function answerButtonClass(
  index: number,
  selected: number | null,
  correctIndex: number | null,
  fiftyFiftyEliminated: number[],
): string {
  const isEliminated = fiftyFiftyEliminated.includes(index);
  if (isEliminated) return 'opacity-30 cursor-not-allowed border-white/5 bg-black/10';

  if (correctIndex !== null) {
    if (index === correctIndex) return 'border-answer-correct bg-answer-correct/20 text-answer-correct shadow-[0_0_24px_rgba(34,197,94,0.4)]';
    if (index === selected && index !== correctIndex) return 'border-answer-wrong bg-answer-wrong/20 text-answer-wrong animate-wrong-shake';
    return 'border-white/5 bg-black/10 opacity-50';
  }

  if (selected === index) return 'border-brand bg-brand/30 shadow-brand cursor-not-allowed';
  if (selected !== null) return 'border-white/5 bg-black/10 opacity-50 cursor-not-allowed';

  return 'border-white/10 bg-black/20 hover:border-gold hover:bg-white/10 cursor-pointer';
}

// ---------------------------------------------------------------------------
// GamePage
// ---------------------------------------------------------------------------
export const GamePage = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [isExiting, setIsExiting] = useState(false);
  const [selectedWagerPowerUpId, setSelectedWagerPowerUpId] = useState('');

  // Wire all WS events → gameStore, and navigate on game:over
  useGameSocket(roomId);

  const user       = useAuthStore((s) => s.user);
  const phase      = useGameStore((s) => s.phase);
  const question   = useGameStore((s) => s.question);
  const result     = useGameStore((s) => s.result);
  const myAnswer   = useGameStore((s) => s.myAnswerIndex);
  const roundNum   = useGameStore((s) => s.roundNumber);
  const totalRounds = useGameStore((s) => s.totalRounds);
  const fiftyFiftyEliminated = useGameStore((s) => s.fiftyFiftyEliminated);
  const eliminated = fiftyFiftyEliminated;
  const revealedOptionIndex = useGameStore((s) => s.revealedOptionIndex);
  const timeBoostActive = useGameStore((s) => s.timeBoostActive);
  const setMyAnswer = useGameStore((s) => s.setMyAnswer);
  const resetRoom = useGameStore((s) => s.resetRoom);
  const leaderboard = useGameStore(selectLeaderboard);
  const players     = useGameStore((s) => s.players);
  const powerupInventory = useProfileStore((s) => s.powerupInventory);
  const setPowerupInventory = useProfileStore((s) => s.setPowerupInventory);

  const availableWagers = Object.values(powerupInventory).filter(
    (item) => item.quantity > 0 && Boolean(item.powerUpId),
  );

  const powerupSlots: PowerupSlot[] = [
    { type: 'DOUBLE_DOWN', owned: powerupInventory.DOUBLE_DOWN.quantity > 0, used: false },
    { type: 'FIFTY_FIFTY', owned: powerupInventory.FIFTY_FIFTY.quantity > 0, used: fiftyFiftyEliminated.length > 0 },
    { type: 'TIME_FREEZE', owned: powerupInventory.TIME_FREEZE.quantity > 0, used: timeBoostActive },
    { type: 'SHIELD', owned: powerupInventory.SHIELD.quantity > 0, used: false },
    { type: 'SABOTAGE', owned: powerupInventory.SABOTAGE.quantity > 0, used: revealedOptionIndex !== null },
  ];

  const isLocked = myAnswer !== null || phase === 'ANSWER_LOCKED' || phase === 'ROUND_RESULT';
  const correctIndex = result?.correctAnswerIndex ?? null;
  const durationSec = question ? question.timeLimitMs / 1000 : 20;

  useEffect(() => {
    let cancelled = false;
    void api.get<PowerupInventoryApiItem[]>('/powerups/inventory')
      .then((response) => {
        if (!cancelled) setPowerupInventory(response.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [question?.roundId, setPowerupInventory]);

  useEffect(() => {
    if (
      selectedWagerPowerUpId &&
      !availableWagers.some((item) => item.powerUpId === selectedWagerPowerUpId)
    ) {
      setSelectedWagerPowerUpId('');
    }
  }, [availableWagers, selectedWagerPowerUpId]);

  const handleAnswer = useCallback((index: number) => {
    if (isLocked || !question || !roomId) return;
    setMyAnswer(index);
    socketService.emit('round:submit_answer', {
      roomId,
      questionId: question.questionId,
      answerIndex: index,
      clientSentAt: new Date().toISOString(),
      ...(selectedWagerPowerUpId
        ? { wagerPowerUpId: selectedWagerPowerUpId }
        : {}),
    });
    setSelectedWagerPowerUpId('');
  }, [isLocked, question, roomId, selectedWagerPowerUpId, setMyAnswer]);

  const handleExitGame = useCallback(async () => {
    if (isExiting) return;

    setIsExiting(true);
    try {
      if (roomId) {
        await api.post(`/rooms/${roomId}/leave`);
      }
    } catch {
      // Local exit still wins so the player is not trapped by a transient API failure.
    } finally {
      socketService.disconnect(true);
      resetRoom();
      navigate('/home', { replace: true });
    }
  }, [isExiting, navigate, resetRoom, roomId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (
        target?.isContentEditable ||
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT'
      ) {
        return;
      }

      const optionIndex = Number(event.key) - 1;
      if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 3) return;
      if (isLocked || !question || !roomId) return;
      if (fiftyFiftyEliminated.includes(optionIndex)) return;

      event.preventDefault();
      handleAnswer(optionIndex);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fiftyFiftyEliminated, handleAnswer, isLocked, question, roomId]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,215,0,0.12),_transparent_40%),linear-gradient(180deg,#101020,#06060C)] px-4 py-6 text-white md:px-8">
      <AnimatePresence>
        {phase === 'ELIMINATION' && (
          <motion.div
            key="elim-banner"
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            className="fixed inset-x-0 top-0 z-50 flex items-center justify-center bg-answer-wrong/90 py-4 text-xl font-black uppercase tracking-widest backdrop-blur"
          >
            💀 A player has been eliminated!
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.5fr_380px]">
        <section className="rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-gold">
                Round {roundNum} / {totalRounds}
              </p>
              <h1 className="mt-1 text-xl font-extrabold text-white/80">
                {phase === 'WAITING'      && 'Waiting for host…'}
                {phase === 'COUNTDOWN'    && 'Get ready!'}
                {phase === 'QUESTION_ACTIVE' && 'Answer now!'}
                {phase === 'ANSWER_LOCKED'   && 'Locked in…'}
                {phase === 'ROUND_RESULT'    && 'Round result'}
                {phase === 'ELIMINATION'     && 'Elimination!'}
                {phase === 'FINALE'          && 'Final round!'}
                {phase === 'GAME_OVER'       && 'Game over'}
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleExitGame()}
                disabled={isExiting}
                className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 transition hover:border-white/30 hover:text-white disabled:opacity-50"
              >
                {isExiting ? 'Exiting...' : 'Exit Game'}
              </button>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl font-black text-gold">
                {question ? `${Math.round(durationSec)}` : '--'}
              </div>
            </div>
          </div>

          {phase === 'QUESTION_ACTIVE' && question && (
            <div className="mb-6">
              <CountdownBar
                duration={durationSec}
                animationKey={question.questionId}
              />
            </div>
          )}

          <div className="rounded-[28px] bg-gradient-to-br from-brand/20 to-white/5 p-6">
            <p className="mb-4 text-sm uppercase tracking-[0.2em] text-white/50">
              Question
            </p>
            <h2 className="text-2xl font-bold leading-snug md:text-3xl">
              {question?.prompt ?? 'Waiting for the host to start the round…'}
            </h2>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {(question?.answers ?? ['Option A', 'Option B', 'Option C', 'Option D']).map(
                (answer, index) => (
                  <motion.button
                    key={`${question?.questionId ?? 'placeholder'}-${index}`}
                    type="button"
                    disabled={isLocked || !question}
                    onClick={() => handleAnswer(index)}
                    whileHover={!isLocked && !!question ? { scale: 1.02 } : {}}
                    whileTap={!isLocked && !!question ? { scale: 0.97 } : {}}
                    className={[
                      'rounded-2xl border px-5 py-4 text-left transition-all duration-200',
                      answerButtonClass(index, myAnswer, correctIndex, eliminated),
                    ].join(' ')}
                  >
                    <span className="mb-1 block text-xs font-bold uppercase tracking-[0.2em] text-gold">
                      {ANSWER_LABELS[index]}
                    </span>
                    <span className="text-base font-medium md:text-lg">{answer}</span>
                  </motion.button>
                ),
              )}
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <p className="text-xs uppercase tracking-[0.25em] text-white/40">Power-ups</p>
              <PowerUpTray
                slots={powerupSlots}
                roomId={roomId ?? ''}
                disabled={isLocked || !question}
              />
            </div>

            <div className="rounded-2xl border border-gold/20 bg-gold/5 p-4">
              <label htmlFor="powerup-wager" className="block text-xs font-bold uppercase tracking-[0.2em] text-gold">
                Bet a power-up on this answer
              </label>
              <select
                id="powerup-wager"
                value={selectedWagerPowerUpId}
                onChange={(event) => setSelectedWagerPowerUpId(event.target.value)}
                disabled={isLocked || !question || availableWagers.length === 0}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white disabled:opacity-50"
              >
                <option value="">No wager</option>
                {availableWagers.map((item) => (
                  <option key={item.code} value={item.powerUpId}>
                    {item.name ?? item.code} ({item.quantity} owned)
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-white/50">
                Correct bettors take the pool. One winner gets every stake; multiple winners split the pool.
              </p>
            </div>
          </div>
        </section>

        <aside className="rounded-[32px] border border-white/10 bg-game-surface/80 p-5 backdrop-blur">
          <p className="mb-4 text-sm uppercase tracking-[0.3em] text-white/50">Leaderboard</p>
          <div className="space-y-3">
            {leaderboard.map((player, i) => (
              <div
                key={player.id}
                className={[
                  'flex items-center gap-3 rounded-2xl border p-3 transition',
                  player.isEliminated
                    ? 'border-white/5 bg-white/3 opacity-40'
                    : player.id === user?.id
                    ? 'border-brand/50 bg-brand/10 shadow-brand'
                    : 'border-white/8 bg-white/5',
                ].join(' ')}
              >
                <span className="w-5 text-center text-sm font-bold text-gold">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                </span>
                <PlayerAvatar player={player} />
              </div>
            ))}
            {leaderboard.length === 0 && (
              <p className="text-sm text-white/30">No players yet…</p>
            )}
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {phase === 'ROUND_RESULT' && result && (
          <motion.div
            key="round-result"
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 32 }}
            className="fixed bottom-6 left-1/2 z-40 w-[min(92vw,560px)] -translate-x-1/2 rounded-[28px] border border-gold/30 bg-black/80 p-6 shadow-royale backdrop-blur"
          >
            <p className="text-xs uppercase tracking-[0.3em] text-gold">Round Result</p>
            <h3 className="mt-2 text-2xl font-bold">
              Correct: {ANSWER_LABELS[result.correctAnswerIndex]}
            </h3>

            <div className="mt-4 space-y-2">
              {result.rankings.slice(0, 5).map((ranking) => {
                const player = players.find((candidate) => candidate.id === ranking.playerId);
                const playerName = resolvePlayerName(player?.displayName, ranking.playerId);

                return (
                  <div key={ranking.playerId} className="flex justify-between text-sm">
                    <span className="text-white/70 truncate">{playerName}</span>
                    <span className={ranking.scoreDelta > 0 ? 'text-answer-correct font-bold' : 'text-answer-wrong'}>
                      {ranking.scoreDelta > 0 ? `+${ranking.scoreDelta}` : ranking.scoreDelta}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
};
