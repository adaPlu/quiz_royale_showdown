# CODEX Handoff — Quiz Royale Showdown

_Last updated: 2026-05-04 — after Week 2 completion_

---

## Repo layout

| Worktree | Branch | Deployed to |
|---|---|---|
| `QuizGame-main` | `main` | Railway (backend, root `/backend`) |
| `QuizGame-webapp` | `frontend` | Vercel (root dir `webapp/`) |
| `QuizGame-android` | `feature/android` | Manual APK / Play Store |
| `QuizGame-backend` | `feature/backend` | (mirror branch, not deployed) |

All worktrees share the same GitHub remote: `https://github.com/adaPlu/quiz_royale_showdown.git`

---

## What works in production

- Auth: register/login/refresh. JWT stored in localStorage (HttpOnly cookie is Month 2 work).
- Lobby: join room by 6-char code, socket connect, player list syncs.
- Host: first player in room is host. Host sees "Start when ready" + Start Game button.
- Game loop: countdown → question → answer submit → round result → elimination → finale → game over.
- Power-ups: fifty_fifty, shield, time_boost, reveal_wrong, second_chance.
- Level-up toasts and loot-drop toasts visible in-game.
- Back/Logout navigation on all main pages.

---

## Recent completed work

### Week 1 — Critical Security (committed: `2a49ddb`)
- Removed hardcoded VAPID key fallbacks from `PushNotificationService.ts`
- JWT/admin secrets: `.refine()` rejects dev values in production (`env.ts`)
- Admin routes: timing-safe secret compare + rate limit 20 req/15 min (`admin.ts`)
- Deleted client-authoritative `POST /:id/progress` XP endpoint (`challenges.ts`)
- Room invite code: `Math.random` → `crypto.randomBytes(3).hex` (`rooms.ts`)
- DB indexes: RefreshToken.tokenHash, XpEvent(userId,createdAt), QuestionBank.isActive, User.displayName (applied via `prisma db push`)

### Week 2 — Data Integrity (committed: `882b769` backend, `d2d6e7a` webapp, `afb2c75` android)

**Backend (`main`):**
- Disconnect handler always emits `room:player_left` before Redis grace key (was skipped — Risk 8)
- Deleted dead `AuthStore.ts` (zero consumers)
- Deleted `POST /powerups/use` 501 stub
- Removed duplicate `apiLimiter` on `/friends` mount (already applied globally)
- Profile endpoint: OR lookup by `id` OR `displayName` case-insensitive
- `joinRoom` wrapped in `prisma.$transaction` to prevent seat-count race
- `GameOrchestrator.runGameOver`: writes `RoomPlayer.score` for each finalist; upserts `PlayerPowerUp` for loot drops (LR1)

**Webapp (`frontend`):**
- `GamePage.tsx`: replaced `useGameStore.getState()` render call with proper selector
- Round result: shows `displayName` via players array lookup (was raw `playerId`)
- `LobbyPage.tsx`: 6-char clamp, socket error display
- `useGameSocket.ts`: `joinedRef` guard prevents double-emit; dependency array `[roomId, accessToken]`

**Android (`feature/android`):**
- HTTP logging: `Level.NONE` in release builds (`AppModule.kt`)

---

## Pending work

### Week 3
- Bot answer submission: bots in `GameOrchestrator` currently join but never call `submitAnswer` (LR2)
- `QuestionSelector`: difficulty curves not implemented — uniform random selection
- Distributed game-start lock: two Railway instances could double-start (LR4)
- Real friends leaderboard: `GET /friends/leaderboard` returns placeholder data (LR8)
- Fix `XpEvent.amount` field: schema uses `amount` but service writes `xpAwarded` (type mismatch at runtime)

### Week 4
- Replace custom logger with `pino` (LR5)
- Add request ID header + Sentry integration
- Remove hardcoded production URLs from source (move to env vars)
- Write missing tests: 12 identified in audit (GameOrchestrator FSM, RoomService.joinRoom, submitAnswer handler, XP calculation, auth refresh rotation, socket reconnect, power-up effects, admin route auth, invitation code entropy, leaderboard sort, level-up trigger, loot-drop probability)

### Month 2
- Replace localStorage JWT with HttpOnly cookies (LR3)
- Push subscription DB persistence — currently in-memory only (LR6)
- Redis AOF/RDB persistence config
- Full server-side challenge verification (LR7)
- Prisma migration history consolidation (shadow DB `RoomStatus` enum blocks `migrate dev` — use `db push` for now)

---

## Known gotchas

- `prisma migrate dev` fails with `P3006` — `RoomStatus` enum pre-exists in shadow DB. Always use `prisma db push` for schema changes on this project.
- Vercel watches `frontend` branch, builds from repo root using root-level `vercel.json` (`buildCommand: "npm run build -w webapp"`, `outputDirectory: "webapp/dist"`).
- Railway watches `main` branch, root directory set to `backend/` in dashboard.
- Socket envelope format: `{ type, version: "v1", payload }` — all events wrapped. Android clients may omit `version`; backend treats absence as v1.
- `feature/backend` branch is a mirror/staging branch — it diverged. Do not merge into `main` without careful conflict resolution of `RoomService.ts` and `registerHandlers.ts`.
