# Quiz Royale Showdown — Phased Implementation Plan (v2)

**Last Updated:** 2026-04-18  
**Lead:** Technical Lead  
**Agents:** Backend (`feature/backend`), Android (`feature/android`), Web (`feature/webapp`)

---

## Phase 0 — Foundation [CURRENT] (Weeks 1–2)

### Status: Backend scaffold written to disk

**What is already on disk:**
- Git repo initialized, `main` branch active
- Comprehensive `.gitignore` (Node, Android, React, Docker)
- Root `docker-compose.yml` (postgres:16.2-alpine, redis:7-alpine, backend, pgadmin)
- Root `.env.example` + `backend/.env.example` + `webapp/.env.example`
- `backend/package.json` (full deps + scripts: dev, build, start, migrate, seed, test)
- `backend/tsconfig.json`
- `backend/prisma/schema.prisma` (15 tables: users, rooms, room_players, rounds, answers, question_bank, power_ups, player_power_ups, power_up_uses, cosmetics, user_cosmetics, xp_events, seasons, season_scores, purchase_receipts)
- `backend/src/config/env.ts` (Zod-validated env)
- `backend/src/utils/logger.ts` (structured logger, JSON in prod)
- `backend/src/utils/errors.ts` (AppError hierarchy)
- `backend/src/utils/ulid.ts` (ULID generator)
- `backend/src/models/prismaClient.ts` (singleton Prisma client)
- `backend/src/services/RedisService.ts` (typed Redis wrapper, all methods)
- `backend/src/services/AuthService.ts` (JWT sign/verify, register/login)
- `backend/src/services/AuthStore.ts` (in-memory user store)
- `backend/src/services/AuthTokenService.ts` (token issuance)
- `backend/src/services/RoomStore.ts` (in-memory room store)
- `backend/src/middleware/validate.ts` (Zod middleware factory)
- `backend/src/middleware/errorHandler.ts` (global error handler)
- `backend/src/middleware/auth.ts` (JWT bearer middleware)
- `backend/src/middleware/httpAuth.ts`
- `backend/src/routes/health.ts` (GET /health → { status: "ok", ts, version })
- `backend/src/routes/auth.ts` (register/login/refresh/logout/me)
- `backend/src/routes/rooms.ts` (create/get/start/leave)
- `backend/src/socket/middleware.ts` (JWT on WS handshake)
- `backend/src/socket/registerHandlers.ts` (room:join, heartbeat, disconnect)
- `backend/src/game/GameStateMachine.ts` (8-state FSM, pure functions)
- `backend/src/game/ScoringEngine.ts` (speed + streak scoring)
- `backend/src/game/EliminationEngine.ts` (bottom-N elimination)
- `backend/src/game/QuestionSelector.ts`
- `backend/src/game/TimerAuthority.ts`
- `backend/src/game/BotBehavior.ts`
- `backend/src/game/XPFormula.ts`
- `backend/src/game/PowerUpBalancer.ts`
- `backend/src/game/types.ts`
- `backend/src/scripts/seed.ts` (power-ups, cosmetics, 10 starter questions, Season 1)
- `backend/src/index.ts` (full bootstrap with graceful shutdown)
- `backend/src/app.ts`, `backend/src/types/contracts.ts`
- `webapp/` — full Vite + React 18 scaffold with GamePage, LobbyPage, stores, services
- `android/` — full Kotlin + Compose scaffold with GameScreen, LobbyScreen, ViewModels, Hilt DI, Room DB, WebSocketManager
- `docs/contracts/api-contract.md` (complete WS + REST spec)
- `docs/contracts/ws-events.md`, `docs/contracts/rest-endpoints.md`
- `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`
- `load-test/game-simulation.js`
- `scripts/upload-assets.sh`

### Remaining Phase 0 tasks

**Backend Agent (`feature/backend`):**
1. Run `prisma migrate dev --name init` to generate the first migration
2. Run `npm run seed` to populate power-ups, cosmetics, sample questions, Season 1
3. Replace in-memory `AuthStore` with Prisma-backed user persistence
4. Add `GET /health` checks for Redis + Postgres connectivity
5. Write integration tests for auth endpoints

**Android Agent (`feature/android`):**
1. Add missing screens: `LoginScreen.kt`, `RegisterScreen.kt`, `ResultsScreen.kt`
2. Connect `WebSocketManager` to `GameViewModel` and wire all 10 WS event handlers
3. Implement `LobbyViewModel.kt` (create room, join by code via REST)
4. Verify Hilt DI graph compiles and app builds (zero red in Android Studio)
5. Smoke-test on emulator: launch → login → lobby screen renders

**Web Agent (`feature/webapp`):**
1. Add `LoginPage.tsx` and `RegisterPage.tsx` (forms + Axios auth calls + localStorage token storage)
2. Wire `App.tsx` router: `/ → LobbyPage`, `/game → GamePage`, `/login → LoginPage`
3. Add `ResultsPage.tsx` (final standings, XP awarded, play-again button)
4. Handle token refresh in `apiClient.ts` (already scaffolded — verify it works)
5. Run `npm run typecheck` — resolve any remaining TS errors

**Infrastructure:**
1. Test `docker-compose up --build` end-to-end
2. Verify `GET /health` returns `{ status: "ok" }` from the container
3. Configure GitHub Actions secrets for CI (RAILWAY_TOKEN, VERCEL_TOKEN if available)

### Phase 0 Integration Gate

All three of these must pass before proceeding to Phase 1:
- [ ] `GET /health` returns HTTP 200 `{ status: "ok", ts: <epoch>, version: "1.0.0" }`
- [ ] `POST /api/v1/auth/register` + `POST /api/v1/auth/login` live and testable via curl/Postman
- [ ] Android app builds (no compile errors) and shows login or lobby screen on emulator
- [ ] Web app builds (`npm run build` in webapp/) and renders lobby page at `http://localhost:5173`

---

## Phase 1 — Core Game Loop (Weeks 3–6)

**Goal:** 5 real players can complete a full game end-to-end on both clients.

### Backend Agent tasks
- **RoomService:** create/join/matchmaking queue/private invite codes
- **GameOrchestrator:** drives FSM via Redis timers (`setTimeout` + Redis lock for crash recovery)
- **Answer submission handler:** server-side timing, `SETNX` duplicate-submission lock per (roundId, userId)
- **Round-end flush:** write answers + scores to PostgreSQL, emit `round:result`
- **Elimination logic:** wire `EliminationEngine` into orchestrator, emit `round:elimination`
- **Finale logic:** final-2 detection, emit `round:finale_started`
- **Game-end:** XP writes via `XPFormula`, emit `game:over`, flush `SeasonScore`
- **Question bank:** seed 500+ questions by importing from Open Trivia DB API (`scripts/import-otdb.ts`)
- **Timers:** `TimerAuthority` with server-clock answer validation (reject answers after lock)
- **Tests:** integration tests for full game flow (GameOrchestrator unit tests with mocked Redis)

### Android Agent tasks
- `LobbyScreen` → REST create/join room → receive `room:state_sync` → navigate to `GameScreen`
- `GameViewModel`: handle all 10 WS events, update `GameUiState`
- `GameScreen`: countdown animation (Canvas ring), question display, answer selection (lock after submit)
- `ResultsScreen`: final standings, XP awarded, animations
- WS reconnect mid-game (exponential backoff, re-join room on reconnect)
- Room cache via Room DB (`GameCacheEntity`) for process-death recovery

### Web Agent tasks
- `LobbyPage` → REST create/join room → receive `room:state_sync` → navigate to `/game`
- `gameStore`: all 10 WS event handlers fully implemented
- `GamePage`: live SVG countdown timer (server-clock sync), answer lock after submit, result overlay
- `ResultsPage`: final standings table, XP badge, "Play Again" button
- Answer keyboard shortcuts 1–4 (already in `GamePage.tsx` — verify they submit correctly)

### Phase 1 Integration Gate
- [ ] 5 players in a room complete a full 10-round game
- [ ] Correct answer revealed on both clients simultaneously
- [ ] Eliminations occur as expected (bottom scorer per round)
- [ ] Game over screen shows correct winner on both clients
- [ ] P95 round-trip latency < 300 ms (measure via `client:heartbeat` timestamps)
- [ ] Backend survives a crash mid-game and recovers from Redis state

---

## Phase 2 — Power-Ups & Game Feel (Weeks 7–9)

**Goal:** All 5 power-ups work; game feels polished.

### Backend Agent
- `PowerUpService`: validate inventory, consume power-up, apply server-side effects
- Power-up effects: DOUBLE_DOWN (score ×2), FIFTY_FIFTY (eliminate 2 wrong opts server-side), TIME_FREEZE (extend lock deadline), SHIELD (bypass elimination), SABOTAGE (mark target as skipped)
- `PowerUpBalancer`: rarity drop rates in room loot
- Emit `powerup:activated` server → client event

### Android Agent
- Power-up tray UI (bottom sheet, cooldown timer)
- Power-up activation animations (particle burst with Canvas)
- SFX integration (SoundPool: correct answer, wrong answer, elimination, victory)
- Haptic feedback on answer submit and elimination

### Web Agent
- Power-up tray (hover card with activation button)
- CSS keyframe animations for each power-up type
- Web Audio API: synthesized sound effects (no external audio assets required)
- Framer Motion transitions between game phases

### Phase 2 Integration Gate
- [ ] All 5 power-ups activate from both clients and server effects apply correctly
- [ ] Balance simulation (1000 simulated games) shows no power-up dominates > 35% win rate contribution
- [ ] Animations run at 60 fps on mid-range devices (Pixel 6 / Chrome on M1 Mac)

---

## Phase 3 — Meta Progression (Weeks 10–13)

**Goal:** Full XP → level → cosmetic → equip flow works cross-platform.

### Backend Agent
- XP ledger: write `XpEvent` rows after each game, compute total XP and level
- Level-up event: emit `user:level_up` via WS on threshold cross
- Cosmetics endpoint: list all, list owned, equip (update `UserCosmetic.equipped`)
- Season ladder: update `SeasonScore` mmr on game end
- Shop: verify Google Play receipts (server-to-server API), Stripe checkout session, `PurchaseReceipt` write
- Daily challenges: `GET /api/v1/challenges`, `POST /challenges/:id/claim`

### Android Agent
- `ProfileScreen`: avatar, level badge, XP progress bar, match history
- `CosmeticsScreen`: grid of owned + locked cosmetics, equip button
- `ShopScreen`: Play Billing v5 integration, SKU list from server, purchase flow
- `LeaderboardScreen`: top 100 players, own rank badge

### Web Agent
- `ProfilePage`: same data as Android, responsive grid
- `CosmeticsPage`: cosmetic grid with equip toggle
- `ShopPage`: Stripe Elements checkout (card form), purchase confirmation
- `LeaderboardPage`: virtual-scrolled table (100+ rows)

### Phase 3 Integration Gate
- [ ] Play a game → XP awarded → level up notification appears on both clients
- [ ] Purchase a cosmetic (test mode) → appears in inventory → can equip → avatar updates in lobby
- [ ] Season leaderboard shows correct MMR ranking

---

## Phase 4 — Feature Parity & PWA (Weeks 14–16)

### Backend Agent
- Friends system: invite by username, accept, list, `GET /api/v1/friends`
- Push notifications: FCM (Android) + VAPID (Web) — game invite, friend request, daily challenge
- Private lobby invite links: `/invite/:token` deep link

### Android Agent
- FCM integration: receive push → deep link into invite lobby
- Deep links: `quizroyale://invite/:token` → join room
- Accessibility pass: content descriptions, min 48dp tap targets, TalkBack support
- Tablet layout: two-pane (player list + game panel)

### Web Agent
- PWA: `vite-plugin-pwa` manifest, service worker, offline "You're offline" screen
- Web Push: subscribe to VAPID, receive game invites
- Invite links: `/invite/:token` page that auto-joins room after login
- SEO/OG tags: `<meta og:*>` for invite share previews

### Phase 4 Integration Gate
- [ ] Android → Web cross-platform invite works end-to-end
- [ ] PWA installable on Chrome desktop and Android Chrome
- [ ] Friends list shows mutual friends, invite sends FCM push

---

## Phase 5 — Polish & Soft Launch (Weeks 17–19)

**All agents:**
- Performance profiling: measure and fix any UI jank (> 16 ms frames)
- Crash rate target: < 0.5% (Firebase Crashlytics on Android, Sentry on Web)
- Load test: 2000 concurrent WebSocket connections via k6 (`load-test/game-simulation.js`)
- Accessibility audit: WCAG 2.1 AA for Web, Android Accessibility Scanner pass
- Security audit: penetration test auth endpoints, validate all inputs server-side
- 1000-user closed beta: 7-day soak, monitor error rates and latency

### Phase 5 Integration Gate
- [ ] Load test: 2000 concurrent WS connections, P99 latency < 500 ms
- [ ] Crash-free rate ≥ 99.5% on Android (Crashlytics)
- [ ] Zero critical/high severity findings in security audit
- [ ] 7-day soak passes with no regressions

---

## Phase 6 — Public Launch (Week 20+)

- Play Store: staged rollout 10% → 50% → 100% over 2 weeks
- Web: production domain `quizroyale.io` live on Vercel
- Backend: Railway production deployment with read replica for leaderboard queries
- CDN: S3 + CloudFront for cosmetic assets
- Monitoring: Datadog dashboards (latency, error rate, active rooms, WS connections)
- Post-launch: telemetry review week 1, Season 1 activation week 2, balance patches as needed

---

## Critical Path

| Milestone | Unblocks | Target Day |
|-----------|----------|-----------|
| `GET /health` + auth endpoints live | Android/Web login flows | Day 2 |
| WS handshake live | Client WS connection tests | Day 3 |
| Prisma migration applied | Room persistence, question seed | Day 4 |
| GameOrchestrator + RoomService live | Phase 1 game loop | Week 3 |
| Full game end-to-end | Phase 2 power-ups, feel work | Week 6 |
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

---

## Top 3 Priorities Per Agent (RIGHT NOW — Phase 0)

### Backend Agent — do these first to unblock everyone

1. **Run `prisma migrate dev --name init`** — creates the database schema; nothing can be persisted until this runs.
2. **Replace AuthStore in-memory map with Prisma queries** — makes `POST /auth/register` survive server restarts; Android/Web auth integration can't be tested reliably without persistence.
3. **Run `npm run seed`** — populates questions, power-ups, and Season 1; the game loop has no questions to serve without this.

### Android Agent — do these first to unblock the team

1. **Add `LoginScreen.kt` + `RegisterScreen.kt` + wire `AppNavGraph.kt`** — agents can't test auth flow at all without a login UI.
2. **Wire `WebSocketManager` → `GameViewModel` for all 10 WS events** — every Phase 1 game-flow task is blocked on this integration.
3. **Verify the Hilt DI graph compiles cleanly** — a broken DI graph blocks all other UI work from building.

### Web Agent — do these first to unblock the team

1. **Add `LoginPage.tsx` + `RegisterPage.tsx` + route them in `App.tsx`** — currently the web app connects a socket without logging in; every feature requires a real JWT.
2. **Verify `apiClient.ts` refresh interceptor works** — without working token rotation, all authenticated REST calls break after 15 minutes.
3. **Run `npm run typecheck` and fix all TS errors** — the CI pipeline gates on typecheck; unresolved errors block every PR merge.
