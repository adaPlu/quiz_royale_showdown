import { useState } from "react";

import { socketService } from "@/services/socketService";

export const LobbyPage = () => {
  const [roomCode, setRoomCode] = useState("ROYALE");

  const joinRoom = () => {
    socketService.send({
      type: "room:join",
      version: "v1",
      payload: {
        roomCode
      }
    });
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(108,62,245,0.35),_transparent_45%),linear-gradient(180deg,_#111122,_#090910)] px-6 py-12 text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <section className="animate-slide-up rounded-[32px] border border-white/10 bg-white/5 p-8 shadow-royale backdrop-blur">
          <p className="mb-3 text-sm uppercase tracking-[0.3em] text-brand-gold">Live Lobby</p>
          <h1 className="max-w-2xl text-5xl font-extrabold leading-tight">
            Queue players fast, then hand off to the real-time round loop.
          </h1>
          <p className="mt-4 max-w-2xl text-white/70">
            This starter screen already talks to the `room:join` socket event and can move into the
            active game page once real room state arrives.
          </p>
        </section>

        <section className="grid gap-6 rounded-[32px] border border-white/10 bg-brand-panel/80 p-8 md:grid-cols-[1fr_auto]">
          <label className="flex flex-col gap-3">
            <span className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">
              Room Code
            </span>
            <input
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
              className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-2xl font-bold tracking-[0.3em] outline-none ring-brand"
              maxLength={8}
            />
          </label>
          <button
            type="button"
            onClick={joinRoom}
            className="rounded-2xl bg-brand px-6 py-4 text-lg font-semibold text-white transition hover:bg-brand-accent"
          >
            Join Room
          </button>
        </section>
      </div>
    </main>
  );
};
