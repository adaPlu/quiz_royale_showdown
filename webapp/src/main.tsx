import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  boards,
  buy,
  clearSession,
  cosmetics,
  currentSeason,
  defaultSession,
  equipCosmetic,
  findMatch,
  friendInvites,
  friends,
  guestSession,
  leaderboard,
  loadSession,
  login,
  matchSocketUrl,
  me,
  register,
  respondInvite,
  saveSession,
  sendInvite,
  store,
  type StoredSession,
} from "./api";
import type { AuthUser, CosmeticItem, Friend, FriendInvite, GameMode, LeaderboardPage, PublicMatch, ServerMessage, StoreItem } from "./types";
import "./styles.css";

type View = "home" | "play" | "login" | "register" | "profile" | "leaderboard" | "friends" | "store" | "season" | "privacy";

function App() {
  const [view, setView] = useState<View>(routeFromLocation());
  const [mode, setMode] = useState<GameMode>("QUICK");
  const [session, setSession] = useState<StoredSession>(() => loadSession());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const onPop = () => setView(routeFromLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    saveSession(session);
  }, [session]);

  useEffect(() => {
    if (!session.token) return;
    me(session.token).then((result) => setUser(result.user)).catch(() => setUser(null));
  }, [session.token]);

  function navigate(next: View) {
    history.pushState(null, "", next === "home" ? "/" : `/${next}`);
    setView(next);
  }

  async function ensureGuest() {
    const guest = await guestSession(session);
    const next = { ...session, guestId: guest.guestId, guestSecret: guest.guestSecret ?? session.guestSecret, displayName: guest.displayName };
    setSession(next);
    return next;
  }

  const authed = Boolean(session.token);

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => navigate("home")}>Quiz Royale</button>
        <nav>
          <button onClick={() => navigate("leaderboard")}>Leaderboard</button>
          <button onClick={() => navigate("friends")}>Friends</button>
          <button onClick={() => navigate("store")}>Store</button>
          <button onClick={() => navigate("season")}>Season</button>
          {authed ? <button onClick={() => navigate("profile")}>{user?.username ?? "Profile"}</button> : <button onClick={() => navigate("login")}>Sign in</button>}
        </nav>
      </header>

      {notice && <div className="notice" onClick={() => setNotice("")}>{notice}</div>}

      {view === "home" && <Home onPlay={async (m) => { setMode(m); await ensureGuest(); navigate("play"); }} />}
      {view === "play" && <Play mode={mode} session={session} ensureGuest={ensureGuest} />}
      {view === "login" && <Login onLogin={(token, u) => { setSession({ ...session, token }); setUser(u); setNotice(`Welcome back, ${u.username}.`); navigate("home"); }} />}
      {view === "register" && <Register session={session} onRegister={(token, u) => { setSession({ ...defaultSession, token, displayName: u.username }); setUser(u); setNotice("Account created."); navigate("home"); }} />}
      {view === "profile" && <Profile token={session.token} user={user} setUser={setUser} logout={() => { clearSession(); setSession(defaultSession); setUser(null); navigate("home"); }} />}
      {view === "leaderboard" && <Leaderboard />}
      {view === "friends" && <Friends token={session.token} />}
      {view === "store" && <Store token={session.token} />}
      {view === "season" && <Season token={session.token} />}
      {view === "privacy" && <Privacy />}
    </div>
  );
}

function Home({ onPlay }: { onPlay: (mode: GameMode) => void }) {
  return (
    <main className="hero">
      <section>
        <p className="eyebrow">Real-time trivia battles</p>
        <h1>Quiz Royale Showdown</h1>
        <p className="lede">Jump into quick matches, survive tournament rounds, or sharpen your trivia streak in practice.</p>
        <div className="modeGrid">
          <Mode title="Quick Match" text="Fast public lobby with bots filling empty seats." onClick={() => onPlay("QUICK")} />
          <Mode title="Tournament" text="Longer royale match with more rounds and pressure." onClick={() => onPlay("TOURNAMENT")} />
          <Mode title="Practice" text="Solo session for question practice and warmups." onClick={() => onPlay("PRACTICE")} />
        </div>
      </section>
    </main>
  );
}

function Mode({ title, text, onClick }: { title: string; text: string; onClick: () => void }) {
  return <button className="mode" onClick={onClick}><strong>{title}</strong><span>{text}</span></button>;
}

function Play({ mode, session, ensureGuest }: { mode: GameMode; session: StoredSession; ensureGuest: () => Promise<StoredSession> }) {
  const [match, setMatch] = useState<PublicMatch | null>(null);
  const [you, setYou] = useState<{ answerIndex: number | null; removedOptions: number[]; powerUpCharges: number } | null>(null);
  const [status, setStatus] = useState("Matchmaking");
  const [error, setError] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const current = await ensureGuest();
        const ticket = await findMatch(mode, current);
        const ws = new WebSocket(matchSocketUrl(ticket.roomId, mode, ticket.roomTicket, current.displayName, current));
        wsRef.current = ws;
        ws.onopen = () => {
          setStatus("Connected");
          ws.send(JSON.stringify({ type: "JOIN_MATCH", name: current.displayName }));
        };
        ws.onmessage = (event) => {
          const msg = JSON.parse(String(event.data)) as ServerMessage;
          if (msg.type === "STATE") {
            setMatch(msg.match);
            setYou(msg.you);
            setStatus(msg.match.phase);
          } else if (msg.type === "ERROR") {
            setError(msg.message);
          }
        };
        ws.onerror = () => setError("Match connection failed.");
        ws.onclose = () => !cancelled && setStatus("Disconnected");
      } catch (err) {
        setError((err as Error).message);
      }
    }
    run();
    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
  }, [mode]);

  const question = match?.question;
  const selected = you?.answerIndex;

  return (
    <main className="panelPage">
      <section className="matchHeader">
        <div><p className="eyebrow">{mode}</p><h1>{match?.phase ?? status}</h1></div>
        <div className="timer">Round {match?.roundNumber ?? 0}/{match?.totalRounds ?? "-"}</div>
      </section>
      {error && <div className="error">{error}</div>}
      {question ? (
        <section className="question">
          <p>{question.category} · {question.difficulty}</p>
          <h2>{question.text}</h2>
          <div className="answers">
            {question.options.map((option, index) => (
              <button
                key={option}
                className={selected === index ? "selected" : ""}
                disabled={selected !== null || match?.phase !== "QUESTION" || you?.removedOptions.includes(index)}
                onClick={() => wsRef.current?.send(JSON.stringify({ type: "SUBMIT_ANSWER", questionId: question.id, answerIndex: index }))}
              >{option}</button>
            ))}
          </div>
          <div className="powerups">
            {["FIFTY_FIFTY", "SHIELD", "DOUBLE_DOWN"].map((powerUp) => (
              <button key={powerUp} disabled={!you?.powerUpCharges || match?.phase !== "QUESTION"} onClick={() => wsRef.current?.send(JSON.stringify({ type: "USE_POWERUP", powerUp }))}>{powerUp.replace("_", " ")}</button>
            ))}
          </div>
        </section>
      ) : <section className="question"><h2>Waiting for the match to begin...</h2></section>}
      <section className="roster">{match?.players.map((p) => <div key={p.id} className="player"><strong>{p.name}</strong><span>{p.score} pts · {p.alive ? `${p.lives} lives` : `#${p.placement}`}</span></div>)}</section>
    </main>
  );
}

function Login({ onLogin }: { onLogin: (token: string, user: AuthUser) => void }) {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  return <Form title="Sign in" error={error} onSubmit={async () => {
    try { const result = await login(id, password); onLogin(result.token, result.profile); } catch (err) { setError((err as Error).message); }
  }}>
    <input placeholder="Email or username" value={id} onChange={(e) => setId(e.target.value)} />
    <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
  </Form>;
}

function Register({ session, onRegister }: { session: StoredSession; onRegister: (token: string, user: AuthUser) => void }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  return <Form title="Create account" error={error} onSubmit={async () => {
    try { const result = await register(username, email, password, session); onRegister(result.token, result.profile); } catch (err) { setError((err as Error).message); }
  }}>
    <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
    <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
    <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
  </Form>;
}

function Form({ title, error, children, onSubmit }: { title: string; error: string; children: React.ReactNode; onSubmit: () => void }) {
  return <main className="formPage"><form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}><h1>{title}</h1>{children}{error && <p className="error">{error}</p>}<button className="primary">Continue</button></form></main>;
}

function Profile({ token, user, setUser, logout }: { token: string | null; user: AuthUser | null; setUser: (user: AuthUser | null) => void; logout: () => void }) {
  const [ownedCosmetics, setOwnedCosmetics] = useState<CosmeticItem[]>([]);
  useEffect(() => { if (token) me(token).then((r) => setUser(r.user)).catch(() => undefined); }, [token]);
  useEffect(() => { if (token) cosmetics(token).then((r) => setOwnedCosmetics(r.cosmetics)).catch(() => undefined); }, [token]);
  if (!token) return <Gate />;
  return <main className="panelPage"><h1>{user?.username ?? "Profile"}</h1><div className="stats"><Stat label="Points" value={user?.stats.totalPoints ?? 0} /><Stat label="Wins" value={user?.stats.wins ?? 0} /><Stat label="Coins" value={user?.currencyBalances.coins ?? 0} /><Stat label="Gems" value={user?.currencyBalances.gems ?? 0} /></div><h2>Cosmetics</h2><section className="cardGrid">{ownedCosmetics.filter((item) => item.owned || item.equipped).map((item) => <div className="shopCard" key={item.cosmeticId}><strong>{item.displayName}</strong><span>{item.cosmeticType} · {item.rarity}</span><b>{item.equipped ? "Equipped" : "Owned"}</b></div>)}</section><button onClick={logout}>Sign out</button></main>;
}

function Friends({ token }: { token: string | null }) {
  const [list, setList] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendInvite[]>([]);
  const [outgoing, setOutgoing] = useState<FriendInvite[]>([]);
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  async function refresh() {
    if (!token) return;
    const [f, invites] = await Promise.all([friends(token), friendInvites(token)]);
    setList(f.friends); setIncoming(invites.incoming); setOutgoing(invites.outgoing);
  }
  useEffect(() => { refresh().catch((e) => setError(e.message)); }, [token]);
  if (!token) return <Gate />;
  return <main className="panelPage"><h1>Friends</h1>{error && <p className="error">{error}</p>}<form className="inline" onSubmit={(e) => { e.preventDefault(); sendInvite(token, username).then(refresh).catch((err) => setError(err.message)); }}><input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} /><button>Invite</button></form><InviteList title="Incoming" invites={incoming} onAction={(id, a) => respondInvite(token, id, a).then(refresh)} /><InviteList title="Outgoing" invites={outgoing} onAction={(id) => respondInvite(token, id, "cancel").then(refresh)} /><section className="roster">{list.map((f) => <div className="player" key={f.userId}><strong>{f.username}</strong><span>{f.presence}{f.matchMode ? ` · ${f.matchMode}` : ""}</span></div>)}</section></main>;
}

function InviteList({ title, invites, onAction }: { title: string; invites: FriendInvite[]; onAction: (id: string, action: "accept" | "decline" | "cancel") => Promise<unknown> }) {
  return <section><h2>{title}</h2>{invites.length === 0 ? <p className="muted">No {title.toLowerCase()} invites.</p> : invites.map((invite) => <div className="player" key={invite.inviteId}><strong>{invite.username}</strong><span><button onClick={() => onAction(invite.inviteId, invite.direction === "incoming" ? "accept" : "cancel")}>{invite.direction === "incoming" ? "Accept" : "Cancel"}</button>{invite.direction === "incoming" && <button onClick={() => onAction(invite.inviteId, "decline")}>Decline</button>}</span></div>)}</section>;
}

function Store({ token }: { token: string | null }) {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [cos, setCos] = useState<CosmeticItem[]>([]);
  const [balances, setBalances] = useState({ coins: 0, gems: 0, seasonalTickets: 0 });
  const [error, setError] = useState("");
  async function refresh() {
    if (!token) return;
    const [s, c] = await Promise.all([store(token), cosmetics(token)]);
    setItems(s.items); setBalances(s.balances); setCos(c.cosmetics);
  }
  useEffect(() => { refresh().catch((e) => setError(e.message)); }, [token]);
  if (!token) return <Gate />;
  return <main className="panelPage"><h1>Store</h1><div className="stats"><Stat label="Coins" value={balances.coins} /><Stat label="Gems" value={balances.gems} /><Stat label="Tickets" value={balances.seasonalTickets} /></div>{error && <p className="error">{error}</p>}<h2>Items</h2><div className="cardGrid">{items.map((item) => <button className="shopCard" key={item.itemId} disabled={item.owned} onClick={() => buy(token, item.itemId).then((r) => { setItems(r.items); setBalances(r.balances); setCos(r.cosmetics); }).catch((e) => setError(e.message))}><strong>{item.displayName}</strong><span>{item.description}</span><b>{item.owned ? "Owned" : `${item.price} ${item.currency}`}</b></button>)}</div><h2>Cosmetics</h2><div className="cardGrid">{cos.map((item) => <button className="shopCard" key={item.cosmeticId} disabled={!item.owned || item.equipped} onClick={() => equipCosmetic(token, item.cosmeticId).then((r) => setCos(r.cosmetics)).catch((e) => setError(e.message))}><strong>{item.displayName}</strong><span>{item.cosmeticType} · {item.rarity}</span><b>{item.equipped ? "Equipped" : item.owned ? "Equip" : "Locked"}</b></button>)}</div></main>;
}

function Season({ token }: { token: string | null }) {
  const [state, setState] = useState<{ season?: { name: string; rewardTrack: Record<string, unknown>[] }; progress?: { xp: number; level: number; ticketsEarned: number } }>({});
  const [error, setError] = useState("");
  useEffect(() => { if (token) currentSeason(token).then(setState).catch((e) => setError(e.message)); }, [token]);
  if (!token) return <Gate />;
  return <main className="panelPage"><h1>{state.season?.name ?? "Season"}</h1>{error && <p className="error">{error}</p>}<div className="stats"><Stat label="Level" value={state.progress?.level ?? 1} /><Stat label="XP" value={state.progress?.xp ?? 0} /><Stat label="Tickets" value={state.progress?.ticketsEarned ?? 0} /></div><section>{state.season?.rewardTrack?.map((reward, i) => <div className="player" key={i}><strong>Level {String(reward.level ?? i + 1)}</strong><span>{Object.entries(reward).filter(([k]) => k !== "level").map(([k, v]) => `${v} ${k}`).join(", ")}</span></div>)}</section></main>;
}

function Leaderboard() {
  const [page, setPage] = useState<LeaderboardPage | null>(null);
  const [allBoards, setBoards] = useState<string[]>(["WORLD"]);
  const [board, setBoard] = useState("WORLD");
  useEffect(() => { boards().then((r) => setBoards(r.boards)).catch(() => undefined); }, []);
  useEffect(() => { leaderboard(board).then(setPage).catch(() => undefined); }, [board]);
  return <main className="panelPage"><h1>Leaderboard</h1><select value={board} onChange={(e) => setBoard(e.target.value)}>{allBoards.map((b) => <option key={b}>{b}</option>)}</select><section className="roster">{page?.entries.map((entry) => <div className="player" key={entry.subjectId}><strong>#{entry.rank} {entry.displayName}</strong><span>{entry.points} pts · {entry.wins} wins</span></div>)}</section></main>;
}

function Privacy() {
  return <main className="panelPage"><h1>Privacy Policy</h1><p>Quiz Royale stores only the account, guest, gameplay, social, and commerce data needed to run the game. Passwords are never stored in plaintext.</p><p>Contact support for account or data questions.</p></main>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong></div>;
}

function Gate() {
  return <main className="panelPage"><h1>Sign in required</h1><p className="muted">Register or sign in to use this feature.</p></main>;
}

function routeFromLocation(): View {
  const path = location.pathname.replace(/^\/+/, "");
  if (["play", "login", "register", "profile", "leaderboard", "friends", "store", "season", "privacy"].includes(path)) return path as View;
  if (path === "privacy-policy") return "privacy";
  return "home";
}

createRoot(document.getElementById("root")!).render(<App />);
