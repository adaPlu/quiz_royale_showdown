# Quiz Royale Showdown — Codex Handoff Document
**Generated:** 2026-04-18  
**Status:** Phase 0 ~70% complete — 3 parallel agents resume work, Technical Lead integrates to main

---

## Repo Location
`c:/Users/plugu/AndroidStudioProjects/QuizGame`

## Git State
- **main** branch: commit `e02108b` (scaffold + Phase 0 backend foundation)
- **feature/backend** branch: exists, checked out by Backend Agent
- **feature/android** branch: exists, checked out by Android Agent
- **feature/webapp** branch: exists, checked out by Web Agent
- Also present (older work): `phase1/android-build-socketio-parity`, `phase1/android-buildable-foundation`, `phase1/backend-contract-persistence`, `phase1/web-playable-vertical-slice`

## Agent Team (resume exactly these 4 agents)

| Agent | Branch | Role |
|---|---|---|
| **Technical Lead** | `main` | Reviews + merges each feature branch when Phase 0 complete |
| **Backend Agent** | `feature/backend` | Node.js/TypeScript backend — Express + Socket.IO + Prisma + Redis |
| **Android Agent** | `feature/android` | Kotlin + Jetpack Compose Android app |
| **Web Agent** | `feature/webapp` | Vite + React 18 + TypeScript + Tailwind web SPA |

---

## Tech Stack (final, do not change)
- **Backend**: Node.js 20 LTS, TypeScript strict, Express 4, Socket.IO 4, Prisma ORM, PostgreSQL 16, Redis 7, ioredis, JWT (15m access / 7d refresh), bcrypt, Zod, Pino
- **Android**: Kotlin, Jetpack Compose BOM 2024.09.00, Hilt 2.51, Retrofit 2.11, OkHttp 4.12, Room 2.6.1, Navigation Compose, Coil, Timber, Google Play Billing v5, Firebase Crashlytics + FCM
- **Web**: Vite 5, React 18, TypeScript strict, Tailwind CSS, Zustand, Socket.IO-client, Framer Motion, Axios, Zod, React Hook Form, Vite PWA plugin, Stripe
- **Infra**: Docker Compose (local), Railway (backend), Vercel (webapp), S3 + CloudFront (assets)

## Brand Colors
- Primary: `#6C3EF5` (purple)
- Gold: `#FFD700`
- Game BG: `#0E0E1A`
- Surface: `#1A1A2E`
- Card: `#16213E`
- Border: `#2D2D4A`
- Muted: `#6B7280`
- Correct: `#22C55E`
- Wrong: `#EF4444`

## WebSocket Contract (shared by all 3 clients/agents)
Envelope: `{ "eventType": "v1:event_name", "roomId": "...", "senderId": "...", "ts": 1234567890, "payload": {} }`

Server → Client events: `v1:room_state`, `v1:countdown_start`, `v1:question`, `v1:answer_locked`, `v1:round_result`, `v1:powerup_used`, `v1:powerup_effect`, `v1:game_over`, `v1:level_up`, `v1:error`

Client → Server events: `v1:player_ready`, `v1:submit_answer`, `v1:use_powerup`, `v1:request_reconnect`

REST base: `/api/v1/` — full spec in `docs/contracts/api-contract.md`

---

## CURRENT FILE INVENTORY

### ✅ BACKEND — Files On Disk (`backend/`)
```
prisma/schema.prisma              ← 15 tables, complete
src/app.ts                        ← Express app factory
src/config/env.ts                 ← Zod-validated env
src/index.ts                      ← Server entry point (bootstrap)
src/middleware/auth.ts            ← requireAuth / optionalAuth (JWT bearer)
src/middleware/errorHandler.ts    ← Global Express error handler
src/middleware/validate.ts        ← Zod validation middleware factory
src/models/prismaClient.ts        ← Singleton Prisma client
src/routes/auth.ts                ← POST /auth/register|login|refresh
src/routes/health.ts              ← GET /health
src/routes/rooms.ts               ← POST /rooms, /rooms/join, GET /rooms/:id
src/services/AuthService.ts       ← JWT sign/verify
src/services/AuthStore.ts         ← In-memory auth (legacy, replace with Prisma)
src/services/GameOrchestrator.ts  ← Drives FSM through game loop
src/services/RedisService.ts      ← Typed Redis wrapper (full)
src/services/RoomService.ts       ← create/join/matchmaking/private codes
src/socket/index.ts               ← Socket.IO setup
src/socket/middleware.ts          ← JWT on WS handshake
src/socket/registerHandlers.ts    ← Event routing
src/socket/handlers/playerReady.ts
src/socket/handlers/reconnect.ts
src/socket/handlers/submitAnswer.ts
src/socket/handlers/usePowerup.ts
src/game/GameStateMachine.ts      ← 8-state FSM with Redis persistence
src/game/ScoringEngine.ts         ← Score formula
src/game/EliminationEngine.ts     ← Bottom-N elimination
src/game/QuestionSelector.ts      ← Difficulty curve, anti-repeat
src/game/TimerAuthority.ts        ← Server-side timing validation
src/game/BotBehavior.ts           ← Solo practice bots
src/game/PowerUpBalancer.ts       ← Balance simulation
src/game/XPFormula.ts             ← XP computation
src/game/types.ts                 ← Shared game types
src/types/contracts.ts            ← WS event types
src/utils/errors.ts               ← AppError hierarchy
src/utils/logger.ts               ← Pino logger
src/utils/ulid.ts                 ← ULID generator
src/scripts/seed.ts               ← Dev seed (users, power-ups, cosmetics, S1)
dist/                             ← Compiled JS (already built once)
tsconfig.json
package.json
Dockerfile
.env.example
```

### ❌ BACKEND — Missing Files (Backend Agent must write these)
```
src/routes/powerups.ts            ← GET /powerups/inventory + POST /powerups/use (stub → Phase 2)
src/routes/cosmetics.ts           ← GET /cosmetics + POST /cosmetics/equip (stub → Phase 3)
src/routes/users.ts               ← GET /users/me + GET /users/:id/profile
src/scripts/seedQuestions.ts      ← Fetches 500q from Open Trivia DB API in batches of 50
```

### ❌ BACKEND — Actions Needed (Backend Agent)
```
1. Run: cd backend && npm install
2. Copy .env.example → .env and fill DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET
3. Run: npx prisma migrate dev --name init  (creates tables in PostgreSQL)
4. Run: npm run seed  (seeds power-ups, cosmetics, Season 1, sample users)
5. Run: npm run dev   (verify GET /health returns 200)
6. Write the 4 missing route files above
7. Run: npm run build (verify TypeScript compiles clean)
8. Commit: git add . && git commit -m "feat(backend): Phase 0 complete"
```

---

### ✅ ANDROID — Files On Disk (`android/`)
Package: `com.quizroyale.showdown`
```
app/build.gradle.kts                          ← Dependencies (verify libs.versions.toml exists)
app/src/main/AndroidManifest.xml
app/src/main/java/com/quizroyale/showdown/
  MainActivity.kt
  QuizRoyaleApp.kt                            ← @HiltAndroidApp
  data/auth/AuthApi.kt                        ← Retrofit interface
  data/auth/AuthRepository.kt                 ← JWT + EncryptedSharedPreferences
  data/auth/TokenRefreshInterceptor.kt
  data/local/AppDatabase.kt                   ← Room DB
  data/local/dao/CosmeticDao.kt
  data/local/dao/GameCacheDao.kt
  data/local/dao/UserDao.kt
  data/local/entity/CosmeticEntity.kt
  data/local/entity/GameCacheEntity.kt
  data/local/entity/UserEntity.kt
  data/socket/WebSocketManager.kt             ← OkHttp WS + exponential backoff
  di/AppModule.kt                             ← Hilt DI module
  domain/model/AnswerOption.kt
  domain/model/GamePlayer.kt
  domain/model/LeaderboardEntry.kt
  domain/model/PowerupType.kt
  domain/model/Question.kt
  ui/game/GameScreen.kt                       ← Canvas timer ring, answer buttons
  ui/game/GameUiState.kt                      ← Sealed class
  ui/game/GameViewModel.kt                    ← MVI, handles all WS events
  ui/lobby/LobbyScreen.kt
  ui/navigation/AppNavGraph.kt
  ui/navigation/Screen.kt
  ui/screens/auth/LoginScreen.kt
  ui/screens/auth/LoginViewModel.kt
  ui/screens/auth/RegisterScreen.kt
  ui/screens/auth/RegisterViewModel.kt
  ui/screens/splash/SplashScreen.kt
  ui/screens/splash/SplashViewModel.kt
  ui/theme/Color.kt
  ui/theme/Theme.kt
  ui/theme/Type.kt
```

### ❌ ANDROID — Missing Files (Android Agent must write these)
```
android/gradle/libs.versions.toml             ← Version catalog (CHECK if exists first)
android/app/src/main/java/com/quizroyale/showdown/
  data/remote/model/WsEnvelope.kt             ← data class WsEnvelope(eventType, roomId, senderId, ts, payload: JsonObject)
  data/remote/model/WsEvent.kt                ← sealed class WsEvent (10 subclasses)
  data/remote/model/AuthModels.kt             ← data classes: LoginRequest, RegisterRequest, TokenResponse
  ui/lobby/LobbyViewModel.kt                  ← MVI for LobbyScreen (WS events → player list state)
  ui/game/GameSideEffect.kt                   ← sealed class GameSideEffect (HapticFeedback, ShowToast, ShowLevelUp)
  ui/screens/home/HomeScreen.kt               ← Create Room + Join by Code + Quick Play
  ui/screens/home/HomeViewModel.kt            ← POST /rooms + POST /rooms/join via Retrofit
  ui/screens/results/ResultsScreen.kt         ← Final leaderboard, XP bar animation, Play Again CTA
  ui/screens/results/ResultsViewModel.kt
```

### ❌ ANDROID — Actions Needed (Android Agent)
```
1. git checkout feature/android
2. Check android/gradle/libs.versions.toml — if missing, create it with:
   Compose BOM 2024.09.00, Hilt 2.51, Retrofit 2.11, OkHttp 4.12, Room 2.6.1,
   Navigation Compose 2.7.7, Coil 2.6.0, Timber 5.0.1, Billing 6.2.1,
   Firebase BOM 33.1.2, Coroutines 1.8.1
3. Verify AppNavGraph.kt routes Login → Register → Home → Lobby → Game → Results
4. Write all 9 missing files listed above
5. Open in Android Studio → Build → Make Project (fix all red errors)
6. Run on emulator — confirm: splash → login → login success → home screen
7. Commit: git add . && git commit -m "feat(android): Phase 0 complete"
```

---

### ✅ WEBAPP — Files On Disk (`webapp/`)
```
vite.config.ts                    ← PWA plugin, proxy, chunk splitting
tailwind.config.ts                ← Brand tokens, custom animations
postcss.config.js
tsconfig.json
tsconfig.app.json
index.html
package.json
src/main.tsx                      ← ReactDOM.createRoot + BrowserRouter
src/App.tsx                       ← Routes + RequireAuth + Suspense
src/index.css                     ← Tailwind directives + Inter font
src/vite-env.d.ts
src/components/PlayerAvatar.tsx   ← Composited avatar+frame+title CSS layers
src/pages/GamePage.tsx            ← SVG timer, answer grid, keyboard shortcuts, Framer Motion modals
src/pages/LobbyPage.tsx           ← Room code, player grid, ready/start flow
src/services/apiClient.ts         ← Axios + JWT interceptor + refresh queue
src/services/socketService.ts     ← Zod-validated typed Socket.IO-client wrapper
src/stores/authStore.ts           ← Zustand auth store (user + accessToken)
src/stores/gameStore.ts           ← Zustand game store (all 10 WS event handlers)
src/types/game.ts                 ← Shared game types
src/lib/contracts.ts              ← WS contract types
.env.example
public/favicon.svg
```

### ❌ WEBAPP — Missing Files (Web Agent must write these)
```
webapp/vercel.json                ← SPA rewrite rule
webapp/src/pages/LoginPage.tsx    ← React Hook Form + Zod, POST /auth/login
webapp/src/pages/RegisterPage.tsx ← username + email + password + confirmPassword validation
webapp/src/pages/HomePage.tsx     ← Quick Play + Create Room + Join by Code
webapp/src/pages/ResultsPage.tsx  ← Final leaderboard, XP summary, share button
webapp/src/pages/ProfilePage.tsx  ← Avatar, XP ring, stats, season rank (stub OK Phase 3)
webapp/src/pages/LeaderboardPage.tsx ← Tabs: Global/Season/Friends, react-window list
webapp/src/components/XpBar.tsx   ← Animated progress bar (brand gradient)
webapp/src/components/SeasonRankBadge.tsx ← Colored tier badge
webapp/src/stores/profileStore.ts ← Zustand: level, xp, equippedCosmeticIds
```

### ❌ WEBAPP — Actions Needed (Web Agent)
```
1. git checkout feature/webapp
2. cd webapp && npm install (install all deps including missing ones)
3. Verify vite.config.ts imports @vitejs/plugin-react and vite-plugin-pwa correctly
4. Write all 10 missing files listed above
5. Run: npm run typecheck (npx tsc --noEmit) — fix all errors
6. Run: npm run dev — confirm login page loads at localhost:5173
7. Commit: git add . && git commit -m "feat(webapp): Phase 0 complete"
```

---

## Integration Protocol (Technical Lead)

After EACH agent commits, Technical Lead runs:
```bash
# Example for backend:
git checkout main
git pull origin feature/backend  # or git fetch + merge
git merge --no-ff feature/backend -m "merge(backend): Phase 0 complete"
git tag phase-0-backend-complete

# Run integration smoke test:
cd backend && npm install && npm run build
docker-compose up -d postgres redis
npx prisma migrate dev
npm run seed
npm run dev &
curl http://localhost:4000/api/v1/health
# Expect: { "status": "ok", "ts": ..., "version": "1.0.0" }
```

Integration gate to merge all 3 to main:
- [ ] `GET /health` → 200
- [ ] `POST /auth/register` → 201 with tokens
- [ ] `POST /auth/login` → 200 with tokens
- [ ] Android app builds with no red errors in Android Studio
- [ ] Android splash → login → home flow works
- [ ] Web app builds (`npm run build` with no errors)
- [ ] Web login page renders at localhost:5173

---

## Phase 0 → Phase 1 Gate

Phase 1 begins when ALL of these pass:
- All 3 feature branches merged to main
- `docker-compose up` brings up backend + postgres + redis with no errors
- Backend health check green
- Prisma migration applied (tables exist)
- Seed data populated (power-ups, cosmetics, Season 1 in DB)

Phase 1 goal: 5 real players complete a full game session end-to-end.

Phase 1 adds:
- **Backend**: `RoomService` fully tested, `GameOrchestrator` drives question loop, answer timing validation live, round_result events flowing, XP written to DB at game end
- **Android**: Full Lobby → Game → Results flow on real device
- **Web**: Full Lobby → Game → Results flow in browser
- Integration gate: P95 round-result latency < 300ms under 5-player load

---

## Phased Roadmap Summary

| Phase | Weeks | Theme | Key Gate |
|---|---|---|---|
| 0 | 1–2 | Foundation | All 3 clients auth + connect + build clean |
| 1 | 3–6 | Core game loop | 5 players complete a game end-to-end |
| 2 | 7–9 | Power-ups + game feel | All 5 power-ups server-authoritative |
| 3 | 10–13 | Meta progression | XP → level → cosmetic → equip cross-platform |
| 4 | 14–16 | PWA + feature parity | PWA installable, Web Push working |
| 5 | 17–19 | Polish + soft launch | 1000-user beta, <0.5% crash rate |
| 6 | 20+ | Public launch | Play Store live, web at production domain |

Full detail: `docs/PHASED_PLAN.md`

---

## Spawning Agents in Next Session

Spawn exactly these 4 agents (1 lead + 3 code):

### Technical Lead prompt summary:
"You are the Technical Lead for Quiz Royale Showdown at `c:/Users/plugu/AndroidStudioProjects/QuizGame`. Read `CODEX_HANDOFF.md`, `docs/PHASED_PLAN.md`, and `docs/AGENTS.md`. You are on `main`. Your job: wait for the 3 code agents to complete their work on `feature/backend`, `feature/android`, `feature/webapp`. When notified each is done, merge their branch to main with `git merge --no-ff`, run the integration smoke test from `CODEX_HANDOFF.md`, and tag the merge. Report any failures."

### Backend Agent prompt summary:
"You are the Backend Code Agent for Quiz Royale Showdown. Branch: `feature/backend`. Working dir: `c:/Users/plugu/AndroidStudioProjects/QuizGame/backend`. Read `CODEX_HANDOFF.md` first. The ❌ BACKEND section lists exactly what you must do. Complete all actions listed there. Commit when done."

### Android Agent prompt summary:
"You are the Android Code Agent for Quiz Royale Showdown. Branch: `feature/android`. Working dir: `c:/Users/plugu/AndroidStudioProjects/QuizGame/android`. Read `CODEX_HANDOFF.md` first. The ❌ ANDROID section lists exactly what you must do. Package name is `com.quizroyale.showdown`. Complete all actions listed there. Commit when done."

### Web Agent prompt summary:
"You are the Web Code Agent for Quiz Royale Showdown. Branch: `feature/webapp`. Working dir: `c:/Users/plugu/AndroidStudioProjects/QuizGame/webapp`. Read `CODEX_HANDOFF.md` first. The ❌ WEBAPP section lists exactly what you must do. Complete all actions listed there. Commit when done."

---

## Key File Reads for Context

Any new agent should read these files first:
1. `CODEX_HANDOFF.md` (this file)
2. `docs/PHASED_PLAN.md` (full 6-phase roadmap)
3. `docs/contracts/api-contract.md` (WS + REST contract)
4. `docs/AGENTS.md` (branch ownership + integration protocol)
5. Their branch's existing files (check with `git diff main..HEAD --name-only`)
