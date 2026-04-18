import type { PlayerSummary } from "@/types/game";

type PlayerAvatarProps = {
  player: PlayerSummary;
};

export const PlayerAvatar = ({ player }: PlayerAvatarProps) => {
  return (
    <div
      className={`rounded-3xl border p-3 transition ${
        player.isEliminated
          ? "border-white/10 bg-white/5 opacity-50"
          : "border-brand-accent/40 bg-white/10 shadow-royale"
      }`}
    >
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-gold/60 bg-gradient-to-br from-brand to-brand-accent font-bold">
          {player.displayName.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold">{player.displayName}</p>
          <p className="text-sm text-white/65">Streak {player.streak}</p>
        </div>
      </div>
      <div className="text-lg font-bold text-brand-gold">{player.score.toLocaleString()} pts</div>
    </div>
  );
};
