# CODEX Handoff — Quiz Royale Showdown

_Last updated: 2026-05-06 — after audit remediation sweep_

---

## Repo layout

| Worktree | Branch | Deployed to |
|---|---|---|
| `QuizGame-main` | `main` | Railway (backend, root `/backend`) |
| `QuizGame-webapp` | `frontend` | Vercel (root dir `webapp/`) |
| `QuizGame-android` | `feature/android` | Manual APK / Play Store |
| `QuizGame-backend` | `feature/backend` | (mirror branch — diverged, not deployed) |

All worktrees share the same GitHub remote: `https://github.com/adaPlu/quiz_royale_showdown.git`

---

## What works in production

- Auth: register / login / refresh / logout. Refresh token in HttpOnly cookie (`qrs.rt`). Access token in memory (15 min TTL).
- Lobby: join room by 6-char code, WebSocket connects, player list syncs.
- Host: first player is host; sees "Start when ready" + Start Game button.
- Game loop: countdown → question → answer submit → round result → elimination → finale → game over.
- Difficulty curves: EASY rounds 1–3, MEDIUM 4–7, HARD 8+ with fallback.
- Bots: single-player games fill a bot; bot submits a random answer with random delay per round.
- Distributed lock: Redis `setnx` prevents double-start across Railway instances.
- Power-ups: fifty_fifty, shield, time_boost, reveal_wrong, second_chance.
- Level-up toasts + loot-drop toasts in-game; loot drops persisted to `PlayerPowerUp`.
- Friends leaderboard: `GET /friends/leaderboard` returns self + accepted friends sorted by totalXp.
- Push notifications: subscriptions written to both Redis and `PushSubscription` table; fallback to DB when Redis down.
- Daily challenges: `win_a_game`, `top_3`, `play_3_games` tracked server-side at game-over.
- Scores, XP, season MMR all persisted to Postgres at game-over.
- Request IDs on every response (`x-request-id`).
- Sentry error capture (gated on `SENTRY_DSN` env var).
- Pino structured logging (NDJSON in prod, pino-pretty in dev).

---

## Completed work by phase

### Week 1 — Critical Security (`2a49ddb`)
- Removed hardcoded VAPID key fallbacks
- JWT/admin secrets reject dev values in production (`env.ts`)
- Admin routes: timing-safe compare + 20 req/15 min rate limit
- Deleted client-authoritative `POST /:id/progress` XP endpoint
- Room invite code: `Math.random` → `crypto.randomBytes(3).hex`
- DB indexes: RefreshToken.tokenHash, XpEvent(userId,createdAt), QuestionBank.isActive, User.displayName

### Week 2 — Data Integrity (`882b769` backend, `d2d6e7a` webapp, `afb2c75` android)
- Disconnect handler always emits `room:player_left` before Redis grace key
- Deleted dead `AuthStore.ts`; deleted `POST /powerups/use` 501 stub
- Removed duplicate `apiLimiter` on `/friends`
- Profile endpoint: OR lookup by id or displayName (case-insensitive)
- `joinRoom` wrapped in `prisma.$transaction` (seat-count race fix)
- `GameOrchestrator.runGameOver`: persists `RoomPlayer.score` + upserts `PlayerPowerUp` loot drops
- Webapp: `GamePage` proper Zustand selector, displayNames in round results, 6-char lobby clamp + error display, stable `useGameSocket` dependency array
- Android: HTTP logging `Level.NONE` in release builds

### Week 3 — Features (`9d14442`)
- Bot answer submission: random-delay Redis writes per round
- Distributed game-start lock via Redis `setnx`
- Difficulty curves in `selectQuestion`
- `GET /friends/leaderboard`
- `ClientEvents` union: added `room:start` and `room:leave`
- `RoomService.toLifecycleState`: fixed missing `hostId` in snapshot

### Week 4 — Infrastructure + Tests (`4132a5d` backend, `147c729` webapp)
- Pino logger (wrapper preserves existing `(msg, data)` API)
- `requestIdMiddleware` stamps `x-request-id` on every request
- Sentry init gated on `SENTRY_DSN`
- Hardcoded Railway URLs removed from webapp; env vars only
- 27 new tests: joinRoom transaction, XpService boundaries, admin auth, friends leaderboard, loot drop, invite code entropy

### Month 2 — Security + Persistence (`e1c7cc3` backend, `c408560` webapp)
- **HttpOnly cookies (LR3)**: `qrs.rt` cookie set on login/register, rotated on refresh, cleared on logout. Body fallback for Android. `formatAuthPayload` no longer leaks refresh token.
- **Push subscription persistence (LR6)**: `PushSubscription` Prisma model added (applied via `db push`). Save/remove writes to Redis + DB. `sendToUser` falls back to DB when Redis unavailable.
- **Challenge tracking (LR7)**: `GameOrchestrator.runGameOver` tracks `win_a_game`, `top_3`, `play_3_games` via XP events with duplicate-award guard. Bots excluded.
- Webapp: `withCredentials: true`, refresh interceptor sends empty body, `authStore` and `apiClient` strip all `refreshToken` state.

### Audit Remediation — Security + Correctness (`284c1c2` backend, `e282463` webapp, `21ed3a3` android)
- **RoomService**: `generateRoomCode` now uses `crypto.randomInt` (was `Math.random`)
- **socket/middleware**: DB error in `prisma.user.findUnique` now rejects connection with `AUTH_DB_ERROR` instead of falling back to unverified JWT payload fields
- **requestId middleware**: always generates fresh UUID; no longer trusts caller-supplied `x-request-id` header
- **app.ts**: `express.json({ limit: '64kb' })`; removed duplicate `requireAuth` at `/friends` mount level
- **leaderboard GET /friends**: now filters by accepted friendships (was leaking global top-N by rating)
- **PowerUpService**: checks Prisma inventory BEFORE setting Redis lock (eliminates permanent lock on Prisma failure)
- **AuthService**: deletes expired `RefreshToken` rows after rotation (prevents unbounded accumulation)
- **schema.prisma**: `Friendship.id @db.VarChar(26)`, `SeasonScore @@index([userId])`, `PowerUpUse @@index([userId],[roomId])`
- **submitAnswer**: Answer rows now persisted to Postgres via upsert; `ANSWER_LOCK_TTL_SECONDS` 3600→300
- **GameOrchestrator**: replaced inline `Math.max(10, score/10)` XP formula with `XpService.awardMatchXp` (proper placement + win bonus)
- **GameOrchestrator**: `RoomPlayer.score` persisted BEFORE `game:over` emit
- **GameOrchestrator**: bot players excluded from loot drops
- **GameOrchestrator**: MMR floor via `GREATEST(mmr-10, 0)` raw SQL (was `{ decrement: 10 }` with no floor)
- **socketService**: `LevelUpPayload.playerId` → `userId`; `powerup:loot_drop` schema `roomId` → `powerupId`
- **apiClient**: access token migrated from `localStorage` to in-memory module variable (XSS hardening)
- **authStore**: `initAuth()` action rehydrates session from HttpOnly cookie on app load; `accessToken` removed from persist
- **useGameSocket**: passes 6-char `roomCode` to `room:join` (was passing ULID `roomId`); localStorage fallback removed
- **gameStore.applyGameOver**: clears stale `question`/`result`/`countdownEndsAt`
- **AppNavGraph**: `LaunchedEffect(roomCode)` — removed `state` key that caused repeated `joinRoom` calls
- **HttpOnly cookies (LR3)**: `qrs.rt` cookie set on login/register, rotated on refresh, cleared on logout. Body fallback for Android. `formatAuthPayload` no longer leaks refresh token.
- **Push subscription persistence (LR6)**: `PushSubscription` Prisma model added (applied via `db push`). Save/remove writes to Redis + DB. `sendToUser` falls back to DB when Redis unavailable.
- **Challenge tracking (LR7)**: `GameOrchestrator.runGameOver` tracks `win_a_game`, `top_3`, `play_3_games` via XP events with duplicate-award guard. Bots excluded.
- Webapp: `withCredentials: true`, refresh interceptor sends empty body, `authStore` and `apiClient` strip all `refreshToken` state.

---

## Remaining work

### Redis AOF/RDB persistence
- Enable `appendonly yes` on Railway Redis service dashboard.
- No code change needed — pure infra config.

### Prisma migration consolidation
- `prisma migrate dev` fails with `P3006` — `RoomStatus` enum pre-exists in shadow DB.
- All schema changes applied via `prisma db push` (safe for this project's Railway setup).
- To fix: spin up a clean shadow DB and run `prisma migrate resolve --applied` for existing migrations, then squash. Low priority.

### Remaining challenge types
- `answer_10` (correct answers) and `streak_5` need per-round answer data.
- `Answer` rows now written to Postgres by `submitAnswer.ts` — these challenges can now be tracked at game-over by querying the `Answer` table.
- `use_powerup`: can be tracked by querying `PowerUpUse` table at game-over (table exists, not yet wired to challenge tracking).

### Android improvements
- Kotlin coroutines for WebSocket reconnect (currently OkHttp callbacks)
- Profile screen: fetch real data from `GET /users/:id/profile`
- Push notification registration on Android (`saveFcmToken` endpoint exists)

### Future / nice-to-have
- Leaderboard: `GET /leaderboard` (global) currently returns placeholder data
- Season end: no cron job to close seasons and award season rewards
- Question bank admin UI: currently questions added only via raw DB inserts or API
- Answer persistence to Postgres: now done — `submitAnswer` upserts `Answer` rows. Enables `answer_10`/`streak_5` challenge tracking.

---

## Known gotchas

- `prisma migrate dev` — always use `prisma db push` for schema changes (shadow DB `RoomStatus` conflict).
- Vercel watches `frontend` branch; root-level `vercel.json` sets `buildCommand: "npm run build -w webapp"` and `outputDirectory: "webapp/dist"`.
- Railway watches `main` branch, root directory `/backend` in dashboard.
- Socket envelope format: `{ type, version: "v1", payload }` — all events wrapped. Android clients may omit `version`; backend treats absence as v1.
- `feature/backend` branch diverged from `main` — do not merge without careful conflict resolution of `RoomService.ts` and `registerHandlers.ts`.
- Cookie `sameSite: 'strict'` + `path: '/api/v1/auth'` — the refresh cookie is only sent to auth routes. Non-auth requests use the Bearer access token only.
- CORS is configured with `credentials: true` and a specific origin (`CORS_ORIGIN` env var). Wildcard `*` will not work with `withCredentials: true`.
