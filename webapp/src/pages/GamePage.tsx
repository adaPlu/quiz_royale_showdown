import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";

import { PlayerAvatar } from "@/components/PlayerAvatar";
import { socketService } from "@/services/socketService";
import { useGameStore } from "@/stores/gameStore";

export const GamePage = () => {
  const { players, question, phase, result, roomId } = useGameStore();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!question || !roomId) {
        return;
      }

      const answerIndex = Number(event.key) - 1;
      if (answerIndex < 0 || answerIndex > 3) {
        return;
      }

      socketService.send({
        type: "round:submit_answer",
        version: "v1",
        payload: {
          roomId,
          questionId: question.questionId,
          answerIndex,
          clientSentAt: new Date().toISOString()
        }
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [question, roomId]);

  const circumference = 2 * Math.PI * 54;
  const progress = question ? 0.35 : 1;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,215,0,0.18),_transparent_38%),linear-gradient(180deg,_#101020,_#06060C)] px-4 py-6 text-white md:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.5fr_380px]">
        <section className="rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-brand-gold">Round Feed</p>
              <h1 className="mt-2 text-3xl font-extrabold">Phase: {phase}</h1>
            </div>
            <svg viewBox="0 0 140 140" className="h-28 w-28">
              <circle cx="70" cy="70" r="54" stroke="rgba(255,255,255,0.12)" strokeWidth="12" fill="none" />
              <circle
                cx="70"
                cy="70"
                r="54"
                stroke="#FFD700"
                strokeWidth="12"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress)}
                strokeLinecap="round"
                transform="rotate(-90 70 70)"
              />
              <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle" fill="white" className="text-lg font-bold">
                {question ? `${Math.round(question.timeLimitMs / 1000)}s` : "--"}
              </text>
            </svg>
          </div>

          <div className="rounded-[28px] bg-gradient-to-br from-brand/30 to-white/5 p-6">
            <p className="mb-4 text-sm uppercase tracking-[0.2em] text-white/60">Current Question</p>
            <h2 className="text-3xl font-bold leading-tight">
              {question?.prompt ?? "Waiting for the host to start the countdown."}
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {(question?.answers ?? ["Option 1", "Option 2", "Option 3", "Option 4"]).map(
                (answer, index) => (
                  <button
                    key={answer}
                    type="button"
                    className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-left transition hover:border-brand-gold hover:bg-white/10"
                  >
                    <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-brand-gold">
                      {index + 1}
                    </span>
                    <span className="text-lg font-medium">{answer}</span>
                  </button>
                )
              )}
            </div>
          </div>
        </section>

        <aside className="rounded-[32px] border border-white/10 bg-brand-panel/85 p-5">
          <p className="mb-4 text-sm uppercase tracking-[0.3em] text-white/60">Players</p>
          <div className="space-y-4">
            {players.map((player) => (
              <PlayerAvatar key={player.id} player={player} />
            ))}
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="fixed bottom-6 left-1/2 w-[min(92vw,560px)] -translate-x-1/2 rounded-[28px] border border-brand-gold/40 bg-black/70 p-6 shadow-royale backdrop-blur"
          >
            <p className="text-sm uppercase tracking-[0.3em] text-brand-gold">Round Result</p>
            <h3 className="mt-2 text-2xl font-bold">Correct answer: #{result.correctAnswerIndex + 1}</h3>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
};
