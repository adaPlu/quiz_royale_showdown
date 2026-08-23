import type { GameMode } from "./protocol";

export type MatchRoomIdentity = {
  kind: "USER" | "GUEST";
  subjectId: string;
  displayName: string;
  powerUpCharges: number;
};

export function buildMatchRoomTargetUrl(
  sourceUrl: string,
  roomId: string,
  mode: GameMode,
  identity: MatchRoomIdentity,
  ticketUseKey?: string,
): string {
  const target = new URL(sourceUrl);
  target.pathname = `/room/${encodeURIComponent(roomId)}`;
  target.search = "";
  target.searchParams.set("playerId", identity.subjectId);
  target.searchParams.set("name", identity.displayName);
  target.searchParams.set("kind", identity.kind);
  target.searchParams.set("mode", mode);
  target.searchParams.set("powerUpCharges", String(identity.powerUpCharges));
  if (ticketUseKey) target.searchParams.set("ticketUseKey", ticketUseKey);
  return target.toString();
}
