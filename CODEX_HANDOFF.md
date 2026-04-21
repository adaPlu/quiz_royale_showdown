# Quiz Royale Showdown — Codex Handoff Document
**Updated:** 2026-04-21  
**Current tag:** `phase-5-complete` (`abec881` on `main`)  
**Status:** Phases 0–5 complete — ready for Phase 6 (Public Launch)

---

## Worktree Layout

| Worktree path | Branch | Role |
|---|---|---|
| `C:/Users/plugu/AndroidStudioProjects/QuizGame-main` | `main` | Tech Lead — merge target |
| `C:/Users/plugu/AndroidStudioProjects/QuizGame-backend` | `feature/backend` | Backend Agent |
| `C:/Users/plugu/AndroidStudioProjects/QuizGame-android` | `feature/android` | Android Agent |
| `C:/Users/plugu/AndroidStudioProjects/QuizGame-webapp` | `feature/webapp` | Web Agent |

**CRITICAL — Agent Permissions:** Spawned subagents can ONLY access `C:/Users/plugu/AndroidStudioProjects/QuizGame` (main worktree). All implementation must be done by the primary agent inline, using `git -C <worktree-path>` for git operations.

---

## Tech Stack (do not change)

- **Backend**: Node.js 20 LTS, TypeScript strict, Express 4, Socket.IO 4, Prisma ORM, PostgreSQL 16, Redis 7, ioredis, JWT (15m access / 7d refresh), bcrypt, Zod, Pino
- **Android**: Kotlin, Jetpack Compose BOM 2024.09.00, Hilt 2.51, Retrofit 2.11, OkHttp 4.12, Room 2.6.1, Navigation Compose, Coil, Timber, Firebase Crashlytics + FCM
- **Web**: Vite 5, React 18, TypeScript strict, Tailwind CSS, Zustand, Socket.IO-client, Framer Motion, Axios, Zod, React Hook Form, vite-plugin-pwa + Workbox

## Brand Colors

- Primary: `#6C3EF5` | Gold: `#FFD700` | BG: `#0E0E1A` | Surface: `#1A1A2E`
- Correct: `#22C55E` | Wrong: `#EF4444` | Muted: `#6B7280`

---

## WebSocket Contract

Envelope: `{ type: "event_name", version: "v1", payload: {} }`

**Server → Client:**
- `room:state_sync`, `room:player_joined`, `room:player_left`
- `round:countdown_started`, `round:question_started`, `round:answer_locked`, `round:result`
- `round:elimination`, `round:finale_started`
- `powerup:activated`, `powerup:effect`, `powerup:loot_drop`
- `game:over`
- `player:level_up` → `{ playerId, newLevel, xp, xpToNextLevel }`

**Client → Server:** `room:join`, `round:submit_answer`, `powerup:activate`, `client:heartbeat`

**Socket connection status events (webapp socketService):**
- `onStatusChange(handler)` → fires `'connected' | 'disconnected' | 'reconnecting'`

---

## Completed Phases

### Phase 0 — Foundation
- Backend: Express + Prisma + Redis + JWT auth + socket handshake
- Android: Hilt DI + Retrofit + OkHttp WS + Room + auth flow
- Web: Vite + React + Zustand + Axios + Socket.IO-client + auth pages

### Phase 1 — Core Game Loop
- Backend: GameOrchestrator FSM, ScoringEngine, EliminationEngine, QuestionSelector, TimerAuthority, loot drops
- Android: GameViewModel MVI, GameRepository socket parsing, LobbyViewModel, GameScreen
- Web: gameStore (all 10 event handlers), GamePage, LobbyPage, socketService (Zod-validated)

### Phase 2 — Power-Ups + Game Feel
- Backend: `PowerUpBalancer` (rarity weights, rollLoot, loot drop post-round)
- Android: `PowerUpTray.kt`, `GameSoundManager.kt`, `ShowLootDrop`/audio `GameSideEffect`s
- Web: `PowerUpActivationFx.tsx`, `LootDropToast.tsx`, `useGameAudio.ts`, `lootDrop` in gameStore

### Phase 3 — Meta Progression
- Backend: `XpService.ts` (level formula: `floor(sqrt(totalXp/150))`), `awardMatchXp()`, season MMR upsert, `player:level_up` emit
- Backend: Leaderboard route (`GET /leaderboard?season=current`, `/leaderboard/friends`)
- Android: `ProfileScreen.kt`, `LeaderboardScreen.kt`+VM+API, `CosmeticsScreen.kt`+VM, `GameEvent.LevelUp`, `GameSideEffect.ShowLevelUp`
- Web: `LevelUpToast.tsx`, leaderboard tabs (season/global/friends), cosmetics equip in ProfilePage, `player:level_up` in useGameSocket + profileStore

### Phase 4 — PWA + Feature Parity
- Backend: `PushNotificationService.ts` (VAPID, Redis sets), `/push/vapid-public-key|subscribe`, `/challenges/daily`, rate limiters, room rejoin endpoint, health check hardening
- Android: `QuizFcmService.kt` + `POST_NOTIFICATIONS` + Manifest, `AppNavGraph` Scaffold+Snackbar, `CosmeticsScreen` (optimistic equip), cosmetics nav route
- Web: vite-plugin-pwa Workbox config, full PWA manifest with icons+screenshots, `useWebPush.ts`, `OfflineBanner.tsx`, ProfilePage push toggle, correct leaderboard API endpoints

### Phase 5 — Polish + Soft Launch ✅ (current HEAD)
- Backend: `authLimiter` (20/15min), `apiLimiter` (120/min), `gameActionLimiter` (5/sec) on routes; health endpoint async DB+Redis ping with 503 on degraded; `/rooms/:roomId/rejoin` endpoint
- Android: `QuizRoyaleApp.kt` Crashlytics init (disabled in debug); `GameScreen.kt` — `PowerUpTray` integration, `isReconnecting` fullscreen overlay, `localLocked` double-tap guard, answer indicators (✓/✗/●); `HomeScreen.kt` Leaderboard nav button
- Web: `ErrorBoundary.tsx` class component (Go Home on crash); `ToastManager.tsx` global LevelUp+LootDrop queue; `SocketReconnectBanner.tsx` amber banner on disconnect/reconnect; `useSocketStatus` hook; `socketService.ts` `onStatusChange()`; `ResultsPage.tsx` XP counter RAF animation + staggered standings; `NotFoundPage.tsx` 404; wildcard route now shows 404 instead of redirect

---

## Phase 6 — Public Launch (NEXT)

### Launch Checklist
- [ ] **Backend**: Deploy to Railway with production env vars (DATABASE_URL, REDIS_URL, VAPID keys, JWT secrets)
- [ ] **Backend**: Run `prisma migrate deploy` on production DB
- [ ] **Backend**: Configure CORS origin to production webapp domain
- [ ] **Webapp**: Deploy to Vercel — set `VITE_API_BASE_URL`, `VITE_WS_BASE_URL` env vars
- [ ] **Webapp**: Register service worker in production (already wired via vite-plugin-pwa)
- [ ] **Android**: Update `BASE_URL` in `NetworkModule.kt` to production backend URL
- [ ] **Android**: Upload signed APK/AAB to Play Store internal track
- [ ] **Android**: Add `google-services.json` for production Firebase project
- [ ] **Monitoring**: Enable Crashlytics in production; configure Pino log drain
- [ ] **Smoke test**: Full game flow (login → quick play → game → results → leaderboard) on each platform

### Backend env vars needed for production
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=<random 64-char>
JWT_REFRESH_SECRET=<random 64-char>
VAPID_PUBLIC_KEY=<from web-push generateVAPIDKeys()>
VAPID_PRIVATE_KEY=<from web-push generateVAPIDKeys()>
VAPID_SUBJECT=mailto:adapluguez@gmail.com
CORS_ORIGIN=https://your-vercel-app.vercel.app
PORT=4000
NODE_ENV=production
```

---

## Key Invariants (never break)

| Invariant | Why |
|---|---|
| WS envelope always `{ type, version: "v1", payload }` | All 3 clients parse this shape |
| Power-up codes UPPERCASE on backend (`FIFTY_FIFTY`) | DB + orchestrator use uppercase |
| Power-up codes lowercase on webapp (`fifty_fifty`) | `PowerUpTray` slot types; ToastManager lowercases on receive |
| Android uses `GameSideEffect` pattern (not direct side effects in VM) | MVI contract |
| `socketService.ts` ServerEventSchemas + `contracts.ts` must stay in sync | Both parse the same WS events |
| `src/utils/logger.ts` on backend has explicit `Logger` interface | TS7022 circular inference bug |
| Worktree agents cannot access each other's paths | Permission architecture |
| XP level formula: `floor(sqrt(totalXp / 150))`, min level 1 | Must match between XpService.ts and all clients |

---

## Recent `main` Git Log

```
abec881 merge(webapp): Phase 5 — error boundary, toast manager, socket reconnect, XP animation, 404 page
3eceb10 merge(android): Phase 5 — Crashlytics, power-up tray, reconnect overlay, leaderboard nav
e263111 feat(webapp): Phase 5 — error boundary, toast manager, socket reconnect banner, XP animation, 404 page
bedef8c feat(android): Phase 5 — Crashlytics init, power-up tray wire-up, reconnection overlay, leaderboard nav
8a7ac54 merge(webapp): Phase 4 — PWA manifest, web push, cosmetics equip, offline banner
217c957 merge(android): Phase 4 — FCMService, level-up snackbar, CosmeticsScreen
c7d3655 merge(backend): Phase 4 — web push, daily challenges, push on game-start
```

---

## Phased Roadmap

| Phase | Theme | Status |
|---|---|---|
| 0 | Foundation | ✅ Complete |
| 1 | Core game loop | ✅ Complete |
| 2 | Power-ups + game feel | ✅ Complete |
| 3 | Meta progression | ✅ Complete |
| 4 | PWA + feature parity | ✅ Complete |
| 5 | Polish + soft launch | ✅ Complete |
| 6 | Public launch | 🔄 Next |
