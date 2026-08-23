import type {
  AuthUser,
  CosmeticItem,
  Friend,
  FriendInvite,
  GameMode,
  GuestSession,
  LeaderboardPage,
  MatchmakeResponse,
  Season,
  SeasonProgress,
  StoreItem,
  CurrencyBalances,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "https://railway-api-production-5772.up.railway.app";
const MATCH_BASE = import.meta.env.VITE_MATCH_BASE?.replace(/\/+$/, "");
const WS_BASE = import.meta.env.VITE_WS_BASE?.replace(/\/+$/, "") ?? MATCH_BASE?.replace(/^http/, "ws");

export type StoredSession = {
  token: string | null;
  guestId: string | null;
  guestSecret: string | null;
  displayName: string;
};

export const defaultSession: StoredSession = {
  token: null,
  guestId: null,
  guestSecret: null,
  displayName: "Challenger",
};

export function loadSession(): StoredSession {
  const raw = localStorage.getItem("quiz_royale_session");
  if (!raw) return defaultSession;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    return { ...defaultSession, displayName: parsed.displayName ?? defaultSession.displayName };
  } catch {
    return defaultSession;
  }
}

export function saveSession(session: StoredSession): void {
  localStorage.setItem("quiz_royale_session", JSON.stringify({
    ...defaultSession,
    displayName: session.displayName,
  }));
}

export function clearSession(): void {
  localStorage.removeItem("quiz_royale_session");
}

export async function guestSession(session: StoredSession): Promise<GuestSession> {
  const body: Record<string, string> = { displayName: session.displayName };
  if (session.guestId) body.guestId = session.guestId;
  if (session.guestSecret) body.guestSecret = session.guestSecret;
  const json = await request<{ guest: GuestSession }>("/guest/session", { method: "POST", body });
  return json.guest;
}

export async function login(identifier: string, password: string): Promise<{ token: string; profile: AuthUser }> {
  return request("/auth/login", { method: "POST", body: { identifier, password } });
}

export async function register(username: string, email: string, password: string, session: StoredSession): Promise<{ token: string; profile: AuthUser }> {
  return request("/auth/register", {
    method: "POST",
    body: {
      username,
      email,
      password,
      transferStats: Boolean(session.guestId && session.guestSecret),
      guestId: session.guestId,
      guestSecret: session.guestSecret,
    },
  });
}

export async function me(token: string): Promise<{ user: AuthUser }> {
  const result = await request<{ profile: AuthUser }>("/auth/me", { token });
  return { user: result.profile };
}

export async function findMatch(mode: GameMode, session: StoredSession): Promise<MatchmakeResponse> {
  if (!MATCH_BASE) throw new Error("VITE_MATCH_BASE must point to the Cloudflare Worker match API.");
  return request(`/matchmake?mode=${encodeURIComponent(mode)}`, { base: MATCH_BASE, token: session.token ?? undefined, guest: session });
}

export function matchSocketUrl(roomId: string, mode: GameMode, roomTicket: string, displayName: string, session: StoredSession): string {
  if (!WS_BASE) throw new Error("VITE_WS_BASE or VITE_MATCH_BASE must point to the Cloudflare Worker websocket API.");
  const url = new URL(`${WS_BASE}/match/${encodeURIComponent(roomId)}`);
  url.searchParams.set("mode", mode);
  url.searchParams.set("roomTicket", roomTicket);
  url.searchParams.set("name", displayName);
  return url.toString();
}

export async function leaderboard(board = "WORLD", subjectId?: string): Promise<LeaderboardPage> {
  const suffix = subjectId ? `&subjectId=${encodeURIComponent(subjectId)}` : "";
  return request(`/leaderboard?board=${encodeURIComponent(board)}${suffix}`);
}

export async function boards(): Promise<{ boards: string[] }> {
  return request("/leaderboard/boards");
}

export async function friends(token: string): Promise<{ friends: Friend[] }> {
  return request("/friends", { token });
}

export async function friendInvites(token: string): Promise<{ incoming: FriendInvite[]; outgoing: FriendInvite[] }> {
  return request("/friends/invites", { token });
}

export async function sendInvite(token: string, username: string): Promise<{ incoming: FriendInvite[]; outgoing: FriendInvite[] }> {
  return request("/friends/invites", { method: "POST", token, body: { username } });
}

export async function respondInvite(token: string, inviteId: string, action: "accept" | "decline" | "cancel"): Promise<{ incoming: FriendInvite[]; outgoing: FriendInvite[] }> {
  return request("/friends/invites/respond", { method: "POST", token, body: { inviteId, action } });
}

export async function store(token: string): Promise<{ balances: CurrencyBalances; items: StoreItem[] }> {
  return request("/store/items", { token });
}

export async function buy(token: string, itemId: string): Promise<{ balances: CurrencyBalances; items: StoreItem[]; cosmetics: CosmeticItem[]; duplicate: boolean }> {
  return request("/store/purchase", { method: "POST", token, body: { itemId, idempotencyKey: `web-${itemId}-${crypto.randomUUID()}` } });
}

export async function cosmetics(token: string): Promise<{ cosmetics: CosmeticItem[] }> {
  return request("/cosmetics", { token });
}

export async function equipCosmetic(token: string, cosmeticId: string): Promise<{ cosmetics: CosmeticItem[] }> {
  return request("/cosmetics/equip", { method: "POST", token, body: { cosmeticId } });
}

export async function currentSeason(token: string): Promise<{ season: Season; progress: SeasonProgress }> {
  return request("/seasons/current", { token });
}

async function request<T>(path: string, init: { method?: string; body?: unknown; token?: string; guest?: StoredSession; base?: string } = {}): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  if (init.guest?.guestId) headers.set("X-Guest-Id", init.guest.guestId);
  if (init.guest?.guestSecret) headers.set("X-Guest-Secret", init.guest.guestSecret);
  const response = await fetch(`${init.base ?? API_BASE}${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  const body = json && typeof json === "object" ? json as { message?: string; error?: string } : null;
  if (!response.ok) throw new Error(body?.message ?? body?.error ?? (text || `Request failed: ${response.status}`));
  return json as T;
}
