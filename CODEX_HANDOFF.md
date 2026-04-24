# Quiz Royale Showdown — Codex Handoff Document
**Updated:** 2026-04-23  
**Current HEAD:** `d6adccb` on `main`  
**Status:** React #185 crash fixed; webapp deploying to Vercel; pending end-to-end smoke test

---

## Session 2026-04-23 Summary

### Fixed This Session
1. **CSP blocking login** — `webapp/vercel.json` now allows Railway URLs in `connect-src`
2. **ProfilePage no back nav** — added `← Back to Home` button (`useNavigate('/home')`)
3. **React #185 crash on Enter Game** — root cause: `selectLeaderboard` returned new array reference every render → infinite Zustand loop. Fixed with `useMemo` in `GamePage.tsx`
4. **TypeScript merge type mismatches** — `PowerUpType`/`PowerUpCode` alias, uppercase keys in `LootDropToast`, `PowerUpActivationFx`, `GamePage` power-up slots, `PowerupFeedbackEvent` export in `gameStore`
5. **Rebuilt `webapp/dist/`** — new deterministic bundle `index-CBwjydlU.js` committed; old `index-vKyUHqL-.js` (broken) never committed to git

### Still In Progress
- **Verify Enter Game works** — Vercel deploying `d6adccb`; user must confirm #185 gone in incognito after ~2min
- **Quick play network error** — test after CSP fix propagates
- **End-to-end smoke test** — login → quick play → create room → enter game → play round → results

### Key Technical Notes for Next Session
- `PowerUpCode = 'DOUBLE_DOWN' | 'FIFTY_FIFTY' | 'TIME_FREEZE' | 'SHIELD' | 'SABOTAGE'` (uppercase, in `profileStore.ts`)
- `webapp/dist/` is in `.gitignore`; use `git add -f webapp/dist` to commit pre-built assets
- Zustand selector returning new array/object every call → React #185; always stabilize with `useMemo`
- Backend on Railway: `quizroyaleshowdown-production.up.railway.app`
- Vercel project root is `webapp/` subdirectory

---

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

### Phase 5 — Polish + Soft Launch ✅
- Backend: `authLimiter` (20/15min), `apiLimiter` (120/min), `gameActionLimiter` (5/sec) on routes; health endpoint async DB+Redis ping with 503 on degraded; `/rooms/:roomId/rejoin` endpoint
- Android: `QuizRoyaleApp.kt` Crashlytics init (disabled in debug); `GameScreen.kt` — `PowerUpTray` integration, `isReconnecting` fullscreen overlay, `localLocked` double-tap guard, answer indicators (✓/✗/●); `HomeScreen.kt` Leaderboard nav button
- Web: `ErrorBoundary.tsx` class component (Go Home on crash); `ToastManager.tsx` global LevelUp+LootDrop queue; `SocketReconnectBanner.tsx` amber banner on disconnect/reconnect; `useSocketStatus` hook; `socketService.ts` `onStatusChange()`; `ResultsPage.tsx` XP counter RAF animation + staggered standings; `NotFoundPage.tsx` 404; wildcard route now shows 404 instead of redirect

---

## Phase 6 — Public Launch ✅ (code-complete)

### What was done
- **Backend**: Fixed Dockerfile (multi-stage, `prisma generate`, schema copy to runner); `start.sh` runs `prisma migrate deploy` before server boot; VAPID keys in `env.ts`; PushNotificationService uses env config; `.env.example` documents VAPID vars
- **Android**: Firebase BOM + `firebase-crashlytics-ktx` dependency; `google-services` + `crashlytics` Gradle plugins in root + app `build.gradle.kts`; release build type: `isMinifyEnabled=true`, `isShrinkResources=true`, prod URLs (`wss://api.quizroyale.gg`); comprehensive `proguard-rules.pro` (Retrofit, OkHttp, Hilt, Firebase, Kotlin Serialization, Socket.IO); `network_security_config.xml` blocks cleartext in release, allows emulator localhost in debug
- **Webapp**: `vercel.json` security headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, sw.js no-cache); `robots.txt`; `.env.production.example`; PWA manifest fixed (removed references to non-existent PNG icons)

### Remaining manual deploy steps
- [ ] **Backend**: Deploy Docker image to Railway — fill all vars from `backend/.env.example`
- [ ] **Backend**: Set `CORS_ORIGIN` to your Vercel deployment URL
- [ ] **Webapp**: `vercel deploy` — set `VITE_API_BASE_URL` + `VITE_WS_BASE_URL` in Vercel dashboard
- [ ] **Android**: Add `google-services.json` from Firebase console to `android/app/`
- [ ] **Android**: Create keystore + set signing config in `build.gradle.kts` before AAB upload
- [ ] **Android**: Upload signed release AAB to Play Store internal track
- [ ] **Smoke test**: Login → quick play → game → results → leaderboard on all 3 platforms

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
| 6 | Public launch | ✅ Code-complete — deploy to go live |
