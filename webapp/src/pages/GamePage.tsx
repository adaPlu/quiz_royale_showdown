import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { CountdownBar } from '@/components/CountdownBar';
import { LevelUpToast } from '@/components/LevelUpToast';
import { LootDropToast } from '@/components/LootDropToast';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { PowerUpActivationFx } from '@/components/PowerUpActivationFx';
import { PowerUpTray, type PowerUpSlot, type PowerUpType } from '@/components/PowerUpTray';
import { useGameAudio } from '@/hooks/useGameAudio';
import { useGameSocket } from '@/hooks/useGameSocket';
import { socketService } from '@/services/socketService';
import { useAuthStore } from '@/stores/authStore';
import { useGameStore } from '@/stores/gameStore';
import { useProfileStore } from '@/stores/profileStore';

const ANSWER_LABELS = ['A', 'B', 'C', 'D'];

const answerButtonClass = ({
  index,
  selected,
  correct,
  eliminated,
  revealed,
}: {
  index: number;
  selected: number | null;
  correct: number | null;
  eliminated: number[];
  revealed: number | null;
}) => {
  if (eliminated.includes(index)) {
    return 'cursor-not-allowed border-white/5 bg-black/10 opacity-30';
  }

  if (correct !== null) {
    if (index === correct) {
      return 'border-answer-correct bg-answer-correct/20 text-answer-correct shadow-[0_0_24px_rgba(34,197,94,0.35)]';
    }
    if (index === selected) {
      return 'border-answer-wrong bg-answer-wrong/20 text-answer-wrong animate-wrong-shake';
    }
    return 'border-white/5 bg-black/10 opacity-50';
  }

  if (selected === index) {
    return 'cursor-not-allowed border-brand bg-brand/30 shadow-brand';
  }
  if (selected !== null) {
    return 'cursor-not-allowed border-white/5 bg-black/10 opacity-50';
  }
  if (revealed === index) {
    return 'border-gold bg-gold/10 shadow-[0_0_20px_rgba(255,215,0,0.2)]';
  }

  return 'cursor-pointer border-white/10 bg-black/20 hover:border-gold hover:bg-white/10';
};

export const GamePage = () => {
  const { roomId } = useParams<{ roomId: string }>();
  useGameSocket(roomId);

  const user = useAuthStore((state) => state.user);
  const inventory = useProfileStore((state) => state.powerupInventory);
  const phase = useGameStore((state) => state.phase);
  const question = useGameStore((state) => state.question);
  const result = useGameStore((state) => state.result);
  const myAnswer = useGameStore((state) => state.myAnswerIndex);
  const roundNumber = useGameStore((state) => state.roundNumber);
  const totalRounds = useGameStore((state) => state.totalRounds);
  const eliminated = useGameStore((state) => state.fiftyFiftyEliminated);
  const revealed = useGameStore((state) => state.revealedOptionIndex);
  const usedPowerUps = useGameStore((state) => state.usedPowerUps);
  const setMyAnswer = useGameStore((state) => state.setMyAnswer);
  const lootDrop = useGameStore((state) => state.lootDrop);
  const clearLootDrop = useGameStore((state) => state.clearLootDrop);
  const levelUpQueue = useGameStore((state) => state.levelUpQueue);
  const dismissLevelUp = useGameStore((state) => state.dismissLevelUp);
  const players = useGameStore((state) => state.players);
  const leaderboard = useMemo(
    () => [...players].sort((a, b) => b.score - a.score),
    [players],
  );

  const audio = useGameAudio();
  const [activeFx, setActiveFx] = useState<{ code: PowerUpType; userId: string } | null>(null);
  const onFxComplete = useCallback(() => setActiveFx(null), []);

  // Audio reactions to game events
  useEffect(() => {
    if (result === null || myAnswer === null) return;
    if (myAnswer === result.correctAnswerIndex) audio.playCorrect();
    else audio.playWrong();
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase === 'ELIMINATION') audio.playElimination();
    if (phase === 'GAME_OVER') audio.playVictory();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Power-up activation FX
  useEffect(() => {
    const unsub = socketService.on('powerup:activated', (payload) => {
      setActiveFx({ code: payload.powerUpId as PowerUpType, userId: payload.userId });
      audio.playPowerup();
    });
    return unsub;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const correctIndex = result?.correctAnswerIndex ?? null;
  const isQuestionActive = phase === 'QUESTION_ACTIVE' && !!question;
  const isLocked = !isQuestionActive || myAnswer !== null;
  const durationSec = question ? Math.max(1, question.timeLimitMs / 1000) : 20;
  const activeRoomId = roomId ?? useGameStore.getState().roomId ?? '';

  const powerUpSlots: PowerUpSlot[] = [
    { code: 'FIFTY_FIFTY', owned: inventory.FIFTY_FIFTY.quantity > 0, used: usedPowerUps.includes('FIFTY_FIFTY'), count: inventory.FIFTY_FIFTY.quantity },
    { code: 'SHIELD', owned: inventory.SHIELD.quantity > 0, used: usedPowerUps.includes('SHIELD'), count: inventory.SHIELD.quantity },
    { code: 'TIME_FREEZE', owned: inventory.TIME_FREEZE.quantity > 0, used: usedPowerUps.includes('TIME_FREEZE'), count: inventory.TIME_FREEZE.quantity },
    { code: 'DOUBLE_DOWN', owned: inventory.DOUBLE_DOWN.quantity > 0, used: usedPowerUps.includes('DOUBLE_DOWN'), count: inventory.DOUBLE_DOWN.quantity },
    { code: 'SABOTAGE', owned: inventory.SABOTAGE.quantity > 0, used: usedPowerUps.includes('SABOTAGE'), count: inventory.SABOTAGE.quantity },
  ];

  const submitAnswer = (answerIndex: number) => {
    if (isLocked || !question || !activeRoomId || eliminated.includes(answerIndex)) return;

    setMyAnswer(answerIndex);
    socketService.emit('round:submit_answer', {
      roomId: activeRoomId,
      questionId: question.questionId,
      answerIndex,
      clientSentAt: new Date().toISOString(),
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const answerIndex = Number(event.key) - 1;
      if (answerIndex < 0 || answerIndex > 3) return;
      submitAnswer(answerIndex);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,215,0,0.12),_transparent_40%),linear-gradient(180deg,#101020,#06060C)] px-4 py-6 text-white md:px-8">
      <AnimatePresence>
        {phase === 'ELIMINATION' && (
          <motion.div
            key="elimination"
            initial={{ y: -72, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -72, opacity: 0 }}
            className="fixed inset-x-0 top-0 z-50 flex justify-center bg-answer-wrong/90 py-4 text-lg font-black uppercase tracking-widest backdrop-blur"
          >
            A player has been eliminated
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.5fr_380px]">
        <section className="rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-gold">
                Round {roundNumber} / {totalRounds}
              </p>
              <h1 className="mt-2 text-3xl font-extrabold">
                {phase === 'WAITING' && 'Waiting for host'}
                {phase === 'COUNTDOWN' && 'Get ready'}
                {phase === 'QUESTION_ACTIVE' && 'Answer now'}
                {phase === 'ANSWER_LOCKED' && 'Answer locked'}
                {phase === 'ROUND_RESULT' && 'Round result'}
                {phase === 'ELIMINATION' && 'Elimination'}
                {phase === 'FINALE' && 'Finale'}
                {phase === 'GAME_OVER' && 'Game over'}
              </h1>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-white/45">Timer</p>
              <p className="text-2xl font-black text-gold">{question ? `${Math.round(durationSec)}s` : '--'}</p>
            </div>
          </div>

          {isQuestionActive && (
            <div className="mb-6">
              <CountdownBar duration={durationSec} animationKey={question.questionId} />
            </div>
          )}

          <div className="rounded-[28px] bg-gradient-to-br from-brand/20 to-white/5 p-6">
            <p className="mb-4 text-sm uppercase tracking-[0.2em] text-white/60">Question</p>
            <h2 className="text-2xl font-bold leading-tight md:text-3xl">
              {question?.prompt ?? 'Waiting for the next live question.'}
            </h2>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {(question?.answers ?? ['Option A', 'Option B', 'Option C', 'Option D']).map((answer, index) => (
                <motion.button
                  key={`${question?.questionId ?? 'placeholder'}-${index}`}
                  type="button"
                  disabled={isLocked || eliminated.includes(index)}
                  onClick={() => submitAnswer(index)}
                  whileHover={!isLocked ? { scale: 1.02 } : undefined}
                  whileTap={!isLocked ? { scale: 0.98 } : undefined}
                  className={[
                    'rounded-2xl border px-5 py-4 text-left transition-all duration-200',
                    answerButtonClass({ index, selected: myAnswer, correct: correctIndex, eliminated, revealed }),
                  ].join(' ')}
                >
                  <span className="mb-1 block text-xs font-bold uppercase tracking-[0.2em] text-gold">
                    {ANSWER_LABELS[index]}
                  </span>
                  <span className="text-lg font-medium">{answer}</span>
                </motion.button>
              ))}
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-center">
            <p className="text-xs uppercase tracking-[0.25em] text-white/40">Power-ups</p>
            <PowerUpTray slots={powerUpSlots} roomId={activeRoomId} disabled={!isQuestionActive || !activeRoomId} />
          </div>
        </section>

        <aside className="rounded-[32px] border border-white/10 bg-game-surface/80 p-5 backdrop-blur">
          <p className="mb-4 text-sm uppercase tracking-[0.3em] text-white/50">Leaderboard</p>
          <div className="space-y-4">
            {leaderboard.map((player) => (
              <div key={player.id} className={player.id === user?.id ? 'rounded-3xl ring-2 ring-gold/50' : undefined}>
                <PlayerAvatar player={player} />
              </div>
            ))}
            {leaderboard.length === 0 && (
              <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/40">
                No players synced yet.
              </p>
            )}
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {phase === 'ROUND_RESULT' && result && (
          <motion.div
            key="round-result"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="fixed bottom-6 left-1/2 z-40 w-[min(92vw,560px)] -translate-x-1/2 rounded-[28px] border border-gold/40 bg-black/80 p-6 shadow-royale backdrop-blur"
          >
            <p className="text-sm uppercase tracking-[0.3em] text-gold">Round Result</p>
            <h3 className="mt-2 text-2xl font-bold">Correct answer: {ANSWER_LABELS[result.correctAnswerIndex]}</h3>
            <div className="mt-4 space-y-2">
              {result.rankings.slice(0, 5).map((ranking) => (
                <div key={ranking.playerId} className="flex justify-between gap-4 text-sm">
                  <span className="truncate text-white/70">{ranking.playerId}</span>
                  <span className={ranking.scoreDelta >= 0 ? 'font-bold text-answer-correct' : 'font-bold text-answer-wrong'}>
                    {ranking.scoreDelta >= 0 ? `+${ranking.scoreDelta}` : ranking.scoreDelta}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <PowerUpActivationFx
        powerupCode={activeFx?.code ?? null}
        activatingUserId={activeFx?.userId ?? ''}
        currentUserId={user?.id ?? ''}
        onComplete={onFxComplete}
      />
      <LootDropToast
        powerupCode={lootDrop?.powerupCode as PowerUpType ?? null}
        onDismiss={clearLootDrop}
      />
      <LevelUpToast
        level={levelUpQueue[0]?.newLevel ?? null}
        onDismiss={dismissLevelUp}
      />
    </main>
  );
};
