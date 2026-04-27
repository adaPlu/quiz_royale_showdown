# Quiz Royale Showdown — Phased Implementation Plan (v3)

**Last Updated:** 2026-04-18
**Lead:** Technical Lead
**Agents:** Backend (`feature/backend`), Android (`feature/android`), Web (`feature/webapp`)

---

## Phase 0 — Foundation [COMPLETE] (Weeks 1–2)

### Actual Completion Status (as of 2026-04-25)

| Component | Status | Notes |
|-----------|--------|-------|
| Backend scaffold | Complete | All routes written and mounted; TypeScript clean; 34/34 tests pass |
| Android scaffold | Complete | All core screens and DI wired; assembleDebug passes |
| Web scaffold | Complete | All pages written; typecheck clean; production build passes |

#### Backend Agent (`feature/backend`) — Completion Status

**Written and on disk:**
- `prisma/schema.prisma` — 15 tables, complete
- `src/app.ts`, `src/index.ts`, `src/config/env.ts`
- `src/middleware/auth.ts`, `src/middleware/errorHandler.ts`, `src/middleware/validate.ts`, `src/middleware/httpAuth.ts`
- `src/models/prismaClient.ts`
- `src/routes/auth.ts` (register/login/refresh/logout/me)
- `src/routes/health.ts`
- `src/routes/rooms.ts`
- `src/services/AuthService.ts`, `src/services/AuthStore.ts`, `src/services/AuthTokenService.ts`
- `src/services/RedisService.ts`, `src/services/RoomStore.ts`
- `src/socket/index.ts`, `src/socket/middleware.ts`, `src/socket/registerHandlers.ts`
- `src/socket/handlers/playerReady.ts`, `src/socket/handlers/reconnect.ts`, `src/socket/handlers/submitAnswer.ts`, `src/socket/handlers/usePowerup.ts`
- `src/game/GameStateMachine.ts`, `src/game/ScoringEngine.ts`, `src/game/EliminationEngine.ts`
- `src/game/QuestionSelector.ts`, `src/game/TimerAuthority.ts`, `src/game/BotBehavior.ts`
- `src/game/PowerUpBalancer.ts`, `src/game/XPFormula.ts`, `src/game/types.ts`
- `src/types/contracts.ts`
- `src/utils/errors.ts`, `src/utils/logger.ts`, `src/utils/ulid.ts`
- `src/scripts/seed.ts`
- `Dockerfile`, `tsconfig.json`, `package.json`, `.env.example`

**All route files now written and mounted** (as of 2026-04-25):
- `src/routes/powerups.ts` — `/api/v1/powerups` live
- `src/routes/cosmetics.ts` — `/api/v1/cosmetics` live
- `src/routes/users.ts` — `/api/v1/users` live
- `src/routes/leaderboard.ts` — `/api/v1/leaderboard` live
- `src/routes/challenges.ts` — `/api/v1/challenges` live
- `src/routes/push.ts` — `/api/v1/push` live
- `src/routes/admin.ts` — `/api/v1/admin` live
- Rate limiting: `authLimiter` (20 req/15 min) + `apiLimiter` (120 req/min) active in `app.ts`

**Actions completed:**
- `npm run build` — zero TypeScript errors
- 34/34 tests pass

#### Android Agent (`feature/android`) — Completion Status

**Written and on disk:**
- `app/build.gradle.kts`
- `app/src/main/AndroidManifest.xml`
- `MainActivity.kt`, `QuizRoyaleApp.kt`
- `data/auth/AuthApi.kt`, `data/auth/AuthRepository.kt`, `data/auth/TokenRefreshInterceptor.kt`
- `data/local/AppDatabase.kt`
- `data/local/dao/CosmeticDao.kt`, `data/local/dao/GameCacheDao.kt`, `data/local/dao/UserDao.kt`
- `data/local/entity/CosmeticEntity.kt`, `data/local/entity/GameCacheEntity.kt`, `data/local/entity/UserEntity.kt`
- `data/socket/WebSocketManager.kt`
- `di/AppModule.kt`
- `domain/model/AnswerOption.kt`, `domain/model/GamePlayer.kt`, `domain/model/LeaderboardEntry.kt`
- `domain/model/PowerupType.kt`, `domain/model/Question.kt`
- `ui/game/GameScreen.kt`, `ui/game/GameUiState.kt`, `ui/game/GameViewModel.kt`
- `ui/lobby/LobbyScreen.kt`
- `ui/navigation/AppNavGraph.kt`, `ui/navigation/Screen.kt`
- `ui/screens/auth/LoginScreen.kt`, `ui/screens/auth/LoginViewModel.kt`
- `ui/screens/auth/RegisterScreen.kt`, `ui/screens/auth/RegisterViewModel.kt`
- `ui/screens/splash/SplashScreen.kt`, `ui/screens/splash/SplashViewModel.kt`
- `ui/theme/Color.kt`, `ui/theme/Theme.kt`, `ui/theme/Type.kt`

**All required files now written** (as of 2026-04-25). `./gradlew assembleDebug` passes (BUILD SUCCESSFUL).

Additionally:
- `CountdownRing` is animated via `animateFloatAsState` — sweep angle driven by `timerSeconds` state.

#### Web Agent (`feature/webapp`) — Completion Status

**Written and on disk:**
- `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`
- `tsconfig.json`, `tsconfig.app.json`, `index.html`, `package.json`
- `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`
- `src/components/PlayerAvatar.tsx`
- `src/pages/GamePage.tsx`, `src/pages/LobbyPage.tsx`
- `src/services/apiClient.ts`, `src/services/socketService.ts`
- `src/stores/authStore.ts`, `src/stores/gameStore.ts`
- `src/types/game.ts`, `src/lib/contracts.ts`
- `.env.example`, `public/favicon.svg`

**All required files now written** (as of 2026-04-25). `npm run typecheck` exits 0. Production build exits 0.

Additionally:
- `gameStore.powerupInventory` tracks `powerup:loot_drop` events.
- `GamePage` gates each power-up's `owned` state against actual inventory counts.

### Phase 0 Integration Gate — PASSED

- [x] All feature work merged to `main`
- [x] `GET /health` returns HTTP 200
- [x] `POST /api/v1/auth/register` + `POST /api/v1/auth/login` live
- [x] Android app assembles (`./gradlew assembleDebug` passes)
- [x] Web app typechecks clean (zero errors) and production build passes
- [x] 4,375 active questions in Railway Postgres (audited)
- [ ] `scripts/smoke-test.sh` exits 0 — script not yet verified against current backend

---

## Week-by-Week Sprint Plan — Phases 0–2

### Sprint 1 — Phase 0 Week 1 (Foundation Wiring)

**Theme:** Get all three stacks building cleanly.

#### Backend Agent
- [ ] BACKEND: Run `npm install` + `prisma migrate dev --name init` — migration completes with 15 tables created
- [ ] BACKEND: Copy `.env.example` → `.env`, fill all required vars — `npm run dev` starts without crash
- [ ] BACKEND: Write `src/routes/users.ts` (GET /users/me, GET /users/:id/profile) — both routes return 200 with valid shape
- [ ] BACKEND: Write `src/routes/powerups.ts` (GET /powerups/inventory, POST /powerups/use) — routes registered, return stub 200
- [ ] BACKEND: Write `src/routes/cosmetics.ts` (GET /cosmetics, POST /cosmetics/equip) — routes registered, return stub 200
- [ ] BACKEND: `npm run build` — zero TypeScript errors

#### Android Agent
- [ ] ANDROID: Check/create `gradle/libs.versions.toml` with Compose BOM 2024.09.00, Hilt 2.51, all deps — Gradle sync succeeds
- [ ] ANDROID: Write `data/remote/model/WsEnvelope.kt` + `WsEvent.kt` + `AuthModels.kt` — data classes compile cleanly
- [ ] ANDROID: Write `ui/game/GameSideEffect.kt` sealed class — compiles cleanly
- [ ] ANDROID: Write `ui/lobby/LobbyViewModel.kt` — MVI state for lobby WS events compiles
- [ ] ANDROID: `./gradlew assembleDebug` — build succeeds with no errors

#### Web Agent
- [ ] WEB: `cd webapp && npm install` — no peer dependency errors
- [ ] WEB: Write `src/pages/LoginPage.tsx` (React Hook Form + Zod + POST /auth/login) — form renders and submits
- [ ] WEB: Write `src/pages/RegisterPage.tsx` (username + email + password + confirm validation) — form renders and validates
- [ ] WEB: Write `src/pages/HomePage.tsx` (Quick Play + Create Room + Join by Code) — page renders when authenticated
- [ ] WEB: `npm run typecheck` — zero errors

---

### Sprint 2 — Phase 0 Week 2 (Completion Sprint)

**Theme:** Close all remaining Phase 0 gaps, merge to main.

#### Backend Agent
- [ ] BACKEND: Write `src/scripts/seedQuestions.ts` — fetches 500 questions from Open Trivia DB API in batches of 50, inserts to `question_bank` table
- [ ] BACKEND: Run `npm run seed` + `npx ts-node src/scripts/seedQuestions.ts` — 500+ rows in `question_bank`
- [ ] BACKEND: Run `GET /health` — returns 200 with Redis + Postgres connectivity confirmed
- [ ] BACKEND: Commit `feat(backend): Phase 0 complete` and push `feature/backend`

#### Android Agent
- [ ] ANDROID: Write `ui/screens/home/HomeScreen.kt` + `ui/screens/home/HomeViewModel.kt` — POST /rooms + POST /rooms/join via Retrofit
- [ ] ANDROID: Write `ui/screens/results/ResultsScreen.kt` + `ui/screens/results/ResultsViewModel.kt` — final leaderboard + XP bar animation renders
- [ ] ANDROID: Smoke-test on emulator: splash → login → home screen visible — all 3 screens reachable without crash
- [ ] ANDROID: Commit `feat(android): Phase 0 complete` and push `feature/android`

#### Web Agent
- [ ] WEB: Write `src/pages/ResultsPage.tsx` — final leaderboard, XP summary, share button renders
- [ ] WEB: Write `src/pages/ProfilePage.tsx` — avatar, XP ring, stats render (stubs OK for Phase 3)
- [ ] WEB: Write `src/pages/LeaderboardPage.tsx` — tabs Global/Season/Friends, react-window list renders
- [ ] WEB: Write `src/components/XpBar.tsx` — animated progress bar with brand gradient
- [ ] WEB: Write `src/components/SeasonRankBadge.tsx` — colored tier badge component
- [ ] WEB: Write `src/stores/profileStore.ts` — Zustand store: level, xp, equippedCosmeticIds
- [ ] WEB: Write `vercel.json` — SPA rewrite rule configured
- [ ] WEB: `npm run dev` — login page loads at localhost:5173 with no console errors
- [ ] WEB: Commit `feat(webapp): Phase 0 complete` and push `feature/webapp`

#### Technical Lead
- [ ] LEAD: Merge `feature/backend` to `main` with `--no-ff`, tag `phase-0-backend-complete`
- [ ] LEAD: Merge `feature/android` to `main` with `--no-ff`, tag `phase-0-android-complete`
- [ ] LEAD: Merge `feature/webapp` to `main` with `--no-ff`, tag `phase-0-webapp-complete`
- [ ] LEAD: Run `scripts/smoke-test.sh` — exits 0 — tag `phase-0-complete`

---

### Sprint 3 — Phase 1 Week 3 (Game Engine Wiring)

**Theme:** Backend game loop drives real questions; clients receive events.

#### Backend Agent
- [ ] BACKEND: Wire `GameOrchestrator` into `RoomService` — room start triggers FSM, emits `v1:countdown_start`
- [ ] BACKEND: Implement answer submission handler with `SETNX` duplicate lock per (roundId, userId) — duplicate submits return 409
- [ ] BACKEND: Emit `v1:question` event with server-authoritative start timestamp — clients can render countdown
- [ ] BACKEND: Round-end flush: write answers + scores to PostgreSQL, emit `v1:round_result` — scores persisted after each round

#### Android Agent
- [ ] ANDROID: Wire `WebSocketManager` → `GameViewModel` — all 10 WS events update `GameUiState`
- [ ] ANDROID: Implement `GameScreen` countdown ring animation using Canvas — ring depletes from server `ts` to deadline
- [ ] ANDROID: Answer selection locks after submit — UI disables buttons, shows "locked in" state

#### Web Agent
- [ ] WEB: Wire `gameStore` all 10 WS event handlers fully — each event updates correct store slice
- [ ] WEB: `GamePage` SVG countdown timer synced to server clock — renders correctly across 300ms RTT
- [ ] WEB: Answer lock after submit — buttons disabled, selected answer highlighted

---

### Sprint 4 — Phase 1 Week 4 (Room Flow End-to-End)

**Theme:** Full Lobby → Game → Results flow works for 2 players.

#### Backend Agent
- [ ] BACKEND: `RoomService` matchmaking queue — solo player auto-queued, matched within 10s or starts with bot
- [ ] BACKEND: Elimination logic wired — bottom scorer per round eliminated, `v1:game_over` emitted at final 2
- [ ] BACKEND: XP writes via `XPFormula` at game end — `XpEvent` rows created, `SeasonScore` updated

#### Android Agent
- [ ] ANDROID: Full Lobby → Game → Results navigation flow — user can complete a game end-to-end on emulator
- [ ] ANDROID: WS reconnect with exponential backoff — kill connection mid-game, app rejoins and resumes
- [ ] ANDROID: Room cache via Room DB — process death mid-game recovers room state on restart

#### Web Agent
- [ ] WEB: Full Lobby → Game → Results navigation flow — user can complete a game end-to-end in browser
- [ ] WEB: `ResultsPage` final standings with XP awarded — correct winner shown, XP displayed
- [ ] WEB: Keyboard shortcuts 1–4 submit answers — verified working in `GamePage`

---

### Sprint 5 — Phase 1 Week 5 (Multi-Player Integration)

**Theme:** 3+ real players in a game end-to-end.

#### All Agents
- [ ] BACKEND: Seed 500+ questions — `seedQuestions.ts` runs against production DB in staging
- [ ] BACKEND: Integration tests for full game flow — `GameOrchestrator` unit tests with mocked Redis pass
- [ ] ANDROID: Test 2-device game — two emulators complete a game session
- [ ] WEB: Test browser tab vs Android emulator game — cross-client game session works
- [ ] LEAD: Run k6 load test with 5 simulated players — `load-test/game-simulation.js` passes

---

### Sprint 6 — Phase 1 Week 6 (Phase 1 Gate)

**Theme:** 5 real players complete a full game; latency gate passes.

#### All Agents
- [ ] BACKEND: P95 round-result latency < 300ms under 5-player load — verified via `client:heartbeat` timestamps
- [ ] BACKEND: Backend survives crash mid-game — Redis state recovery tested and working
- [ ] ANDROID: 5-player game completes on real Android device — correct winner displayed
- [ ] WEB: 5-player game completes in Chrome — correct winner displayed
- [ ] LEAD: Phase 1 integration gate: all checklist items pass — tag `phase-1-complete`

---

### Sprint 7 — Phase 2 Week 7 (Power-Up Backend)

**Theme:** Server-authoritative power-up effects.

#### Backend Agent
- [x] BACKEND: `PowerUpService.validateInventory()` — rejects use if player has no inventory
- [x] BACKEND: DOUBLE_DOWN effect: score multiplier applied server-side — client cannot bypass
- [x] BACKEND: FIFTY_FIFTY effect: server picks 2 wrong options to eliminate, sends private `powerup:effect_private` to activating socket
- [x] BACKEND: TIME_FREEZE effect: extend round lock deadline in Redis — `TimerAuthority` respects extended deadline
- [x] BACKEND: SHIELD + SABOTAGE effects implemented — elimination bypass and skip-mark applied server-side

#### Android Agent
- [ ] ANDROID: Power-up tray UI (bottom sheet) — shows available power-ups with cooldown timer
- [ ] ANDROID: Power-up activation emits `v1:use_powerup` WS event — server responds with `v1:powerup_effect`

#### Web Agent
- [ ] WEB: Power-up tray (hover card with activation button) — shows available power-ups
- [ ] WEB: Power-up activation emits `v1:use_powerup` WS event — effect applied visually

---

### Sprint 8 — Phase 2 Week 8 (Power-Up Animations)

**Theme:** Game feel — 60 fps animations, SFX.

#### Android Agent
- [ ] ANDROID: Power-up particle burst Canvas animation — fires at 60fps on Pixel 4a
- [ ] ANDROID: SFX via SoundPool: correct, wrong, elimination, victory — all 4 sounds play correctly
- [ ] ANDROID: Haptic feedback on answer submit and elimination — verified on physical device

#### Web Agent
- [ ] WEB: CSS keyframe animations for each power-up type — distinct visual effect per power-up
- [ ] WEB: Web Audio API synthesized SFX — correct/wrong/elimination sounds play with no external assets
- [ ] WEB: Framer Motion transitions between game phases — no jank on Chrome mobile

---

### Sprint 9 — Phase 2 Week 9 (Phase 2 Gate)

**Theme:** Power-up balance validation + Phase 2 merge.

#### Backend Agent
- [ ] BACKEND: Balance sim: run 1000 simulated games via `PowerUpBalancer` — no power-up > 60% win rate contribution
- [ ] BACKEND: All 5 power-up server effects verified — no client-side bypass possible

#### All Agents
- [ ] LEAD: Animations at 60fps on Pixel 4a and Chrome mobile — frame timing verified
- [ ] LEAD: Phase 2 integration gate: all 5 power-ups activate from both clients correctly — tag `phase-2-complete`

---

## Phase 1 — Core Game Loop (Weeks 3–6)

**Goal:** 5 real players can complete a full game end-to-end on both clients.

### Backend Agent tasks
- **RoomService:** create/join/matchmaking queue/private invite codes
- **GameOrchestrator:** drives FSM via Redis timers (`setTimeout` + Redis lock for crash recovery)
- **Answer submission handler:** server-side timing, `SETNX` duplicate-submission lock per (roundId, userId)
- **Round-end flush:** write answers + scores to PostgreSQL, emit `v1:round_result`
- **Elimination logic:** wire `EliminationEngine` into orchestrator, emit elimination events
- **Finale logic:** final-2 detection, emit `v1:game_over`
- **Game-end:** XP writes via `XPFormula`, emit `v1:game_over`, flush `SeasonScore`
- **Question bank:** seed 500+ questions from Open Trivia DB (`src/scripts/seedQuestions.ts`)
- **Timers:** `TimerAuthority` with server-clock answer validation (reject answers after lock)
- **Tests:** integration tests for full game flow

### Android Agent tasks
- `LobbyScreen` → REST create/join room → receive `v1:room_state` → navigate to `GameScreen`
- `GameViewModel`: handle all 10 WS events, update `GameUiState`
- `GameScreen`: countdown animation (Canvas ring), question display, answer selection (lock after submit)
- `ResultsScreen`: final standings, XP awarded, animations
- WS reconnect mid-game (exponential backoff, re-join room on reconnect)
- Room cache via Room DB (`GameCacheEntity`) for process-death recovery

### Web Agent tasks
- `LobbyPage` → REST create/join room → receive `v1:room_state` → navigate to `/game`
- `gameStore`: all 10 WS event handlers fully implemented
- `GamePage`: live SVG countdown timer (server-clock sync), answer lock after submit, result overlay
- `ResultsPage`: final standings table, XP badge, "Play Again" button
- Answer keyboard shortcuts 1–4 verified working

### Phase 1 Integration Gate — CORE LOOP VERIFIED (smoke:phase2 PASSED 2026-04-26)

- [x] Full 10-round game reaches `game:over` with correct winner and final standings
- [x] Correct answer revealed each round (`round:result` with `correctAnswerIndex` and score deltas)
- [x] Eliminations fire correctly (`round:elimination` with `eliminatedPlayerIds` and survivors)
- [x] Finale logic fires (`round:finale_started` with finalists) before `game:over`
- [x] XP writes confirmed in smoke (xpAwarded in `game:over` payload)
- [ ] 5 real players (smoke tests 2-player simulation only)
- [ ] P95 round-trip latency < 300 ms (k6 load test not yet run)
- [ ] Backend crash mid-game → Redis recovery (not yet tested)

---

## Phase 2 — Power-Ups & Game Feel (Weeks 7–9)

**Goal:** All 5 power-ups work server-authoritatively; game feel is polished.

**Progress as of 2026-04-26:**

### Backend Agent
- [x] `powerup:loot_drop` emitted after `game:over` to finalists with a random power-up type and quantity 1
- [x] `PowerUpService`: validate inventory, consume power-up, apply server-side effects
- [x] Power-up effects enforced server-side: DOUBLE_DOWN, FIFTY_FIFTY, TIME_FREEZE, SHIELD, SABOTAGE
- [ ] `PowerUpBalancer`: rarity drop rates in room loot
- [x] Emit `powerup:effect` + `powerup:effect_private` events (canonical envelope format)

### Android Agent
- [x] `CountdownRing` animated with `animateFloatAsState` (sweep angle driven by `timerSeconds` state)
- [ ] Power-up tray UI (bottom sheet, cooldown timer)
- [ ] Power-up activation animations (particle burst with Canvas)
- [ ] SFX integration (SoundPool)
- [ ] Haptic feedback

### Web Agent
- [x] `gameStore.powerupInventory` tracks received `powerup:loot_drop` events
- [x] `GamePage` gates each power-up's `owned` state against actual inventory count
- [x] `PowerUpTray` connected to `powerup:activate` socket with uppercase backend enum names
- [x] `useGameSocket` handles `powerup:effect_private` — FIFTY_FIFTY mask applied client-side
- [ ] CSS keyframe animations per power-up type
- [ ] Web Audio API synthesized SFX
- [ ] Framer Motion phase transitions

### Phase 2 Integration Gate
- [x] All 5 power-up server effects apply correctly — 94 backend tests pass
- [x] FIFTY_FIFTY client delivery wired end-to-end — webapp typecheck + 15 tests pass
- [ ] Balance simulation shows no power-up > 60% win rate contribution
- [ ] Animations run at 60 fps on Pixel 4a and Chrome mobile

---

## Phase 3 — Meta Progression (Weeks 10–13)

**Goal:** Full XP → level → cosmetic → equip flow works cross-platform.

### Backend Agent
- XP ledger, level-up event, cosmetics endpoints, season ladder, shop receipts, daily challenges

### Android Agent
- `ProfileScreen`, `CosmeticsScreen`, `ShopScreen` (Play Billing v5), `LeaderboardScreen`

### Web Agent
- `ProfilePage`, `CosmeticsPage`, `ShopPage` (Stripe Elements), `LeaderboardPage`

### Phase 3 Integration Gate
- [ ] Play a game → XP awarded → level up notification appears on both clients
- [ ] Purchase a cosmetic (test mode) → appears in inventory → equip → avatar updates in lobby
- [ ] Season leaderboard shows correct MMR ranking

---

## Phase 4 — Feature Parity & PWA (Weeks 14–16)

### Backend Agent
- Friends system, FCM + VAPID push notifications, private lobby invite links

### Android Agent
- FCM integration, deep links, accessibility pass, tablet layout

### Web Agent
- PWA (`vite-plugin-pwa`), Web Push (VAPID), invite links, SEO/OG tags

### Phase 4 Integration Gate
- [ ] Android → Web cross-platform invite works end-to-end
- [ ] PWA installable on Chrome desktop and Android Chrome
- [ ] Friends list, invite sends FCM push

---

## Phase 5 — Polish & Soft Launch (Weeks 17–19)

**All agents:** performance profiling, crash rate < 0.5%, load test 2000 concurrent WS, accessibility audit, security audit, 1000-user closed beta.

### Phase 5 Integration Gate
- [ ] Load test: 2000 concurrent WS connections, P99 latency < 500 ms
- [ ] Crash-free rate >= 99.5% on Android
- [ ] Zero critical/high severity security findings
- [ ] 7-day soak passes with no regressions

---

## Phase 6 — Public Launch (Week 20+)

- Play Store: staged rollout 10% → 50% → 100%
- Web: production domain live on Vercel
- Backend: Railway production deployment with read replica
- CDN: S3 + CloudFront for cosmetic assets
- Monitoring: Datadog dashboards

---

## Critical Path

| Milestone | Unblocks | Target Day |
|-----------|----------|-----------|
| `GET /health` + auth endpoints live | Android/Web login flows | Day 2 |
| WS handshake live | Client WS connection tests | Day 3 |
| Prisma migration applied | Room persistence, question seed | Day 4 |
| 4 missing backend routes written | Full API surface available | Day 7 |
| All 3 feature branches merged to main | Phase 1 start | Week 2 end |
| GameOrchestrator + RoomService live | Phase 1 game loop | Week 3 |
| Full game end-to-end | Phase 2 power-ups | Week 6 |
| XP system live | Phase 3 meta progression UI | Week 10 |
| Payment webhooks live | Shop features | Week 12 |
| Load test passing | Soft launch confidence | Week 18 |

---

## Agent Integration Protocol (Summary)

1. Agent commits milestone work with conventional commit message
2. Agent pushes branch: `git push origin feature/<scope>`
3. Agent opens PR targeting `main` with milestone tag in title
4. Lead reviews: runs `docker-compose up --build`, typechecks, tests
5. Lead merges: `git merge --no-ff feature/<scope>`
6. Lead tags: `git tag phase-N-<scope>-complete`
7. Other agents rebase: `git rebase origin/main`
