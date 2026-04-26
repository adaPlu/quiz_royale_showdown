# Sprint Board

**Last Updated:** 2026-04-25
**Current Phase:** 2 hardening complete — entering Phase 3 (meta systems) and launch hardening
**Lead:** Technical Lead

---

## Done (completed through Phase 2 hardening — 2026-04-25)

### Backend
- [x] `src/routes/powerups.ts` — `/api/v1/powerups` mounted
- [x] `src/routes/cosmetics.ts` — `/api/v1/cosmetics` mounted
- [x] `src/routes/users.ts` — `/api/v1/users` mounted
- [x] `src/routes/leaderboard.ts` — `/api/v1/leaderboard` mounted
- [x] `src/routes/challenges.ts` — `/api/v1/challenges` mounted
- [x] `src/routes/push.ts` — `/api/v1/push` mounted
- [x] `src/routes/admin.ts` — `/api/v1/admin` mounted
- [x] Rate limiting: `authLimiter` (20 req/15 min) on auth; `apiLimiter` (120 req/min) on all `/api/v1`
- [x] `npm run build` — zero TypeScript errors (34/34 tests pass)
- [x] `GameOrchestrator` full game loop: countdown, questions, answers, eliminations, finale, game:over, XP writes
- [x] `powerup:loot_drop` emitted after `game:over` to each finalist
- [x] `gameHandlers.ts` deleted; handlers live in `backend/src/socket/handlers/`

### Android
- [x] `./gradlew assembleDebug` — BUILD SUCCESSFUL
- [x] `CountdownRing` animated with `animateFloatAsState` — sweep angle driven by `timerSeconds` state

### Web
- [x] `npm run typecheck` — zero TypeScript errors
- [x] `npm run build` — Vite production build exits 0
- [x] `gameStore.powerupInventory` tracks `powerup:loot_drop` events
- [x] `GamePage` gates power-up `owned` state against actual inventory counts

### Smoke
- [x] `smoke:phase1` — reaches `round:question_started`
- [x] `smoke:phase2` — full loop to `game:over` (10 rounds, XP writes, final standings verified)

---

## Current Sprint: Phase 3 / Launch Hardening

### Backend Agent
- [ ] Deploy primary backend to Railway (own service, same Postgres + Redis as `QuizGame-main`)
- [ ] Verify `powerup:activate` socket handler fully enforces server-side power-up validation (no client bypass)
- [ ] Shop, friends, seasons routes — Phase 4 scope, do not start until Phase 3 meta loop is stable

### Android Agent
- [ ] Verify end-to-end auth → lobby → game → results on emulator or real device against live backend
- [ ] Verify `powerup:loot_drop` received and reflected in Android UI
- [ ] WS reconnect mid-game — exponential backoff, rejoin, and `room:state_sync` resync

### Web Agent
- [ ] Verify end-to-end browser flow through lobby → game → results against live backend
- [ ] Confirm `powerup:loot_drop` correctly increments tray inventory display
- [ ] Reconnect scenario: refresh mid-game → rejoin room via socket → `room:state_sync` restores state

---

## Integration Gates (Lead merges when ALL items checked per agent)

### Backend merge criteria
- [ ] `GET /health` returns 200
- [ ] `POST /auth/register` returns 201 with accessToken + refreshToken
- [ ] `POST /auth/login` returns 200 with accessToken + refreshToken
- [ ] TypeScript build clean (`npm run build` zero errors)
- [ ] 500+ rows in `question_bank` table

### Android merge criteria
- [ ] `./gradlew assembleDebug` passes
- [ ] Login flow runs end-to-end on emulator (splash → login → home)
- [ ] No Hilt DI graph compile errors

### Web merge criteria
- [ ] `npm run typecheck` zero errors
- [ ] `npm run dev` renders login page at localhost:5173
- [ ] No console errors on load

### All-agents gate (tag phase-0-complete when all 3 merged)
- [ ] `docker-compose up` starts backend + postgres + redis with no errors
- [ ] `scripts/smoke-test.sh` exits 0
- [ ] Prisma migration applied (tables confirmed via psql)
- [ ] Seed data populated (power-ups, cosmetics, Season 1)

---

## Next Sprint: Phase 1 Week 3 — Core Game Loop (auto-populated when Phase 0 merges complete)

### Backend Agent
- [ ] Wire `GameOrchestrator` into `RoomService` — room start triggers FSM, emits `v1:countdown_start`
- [ ] Answer submission handler with `SETNX` duplicate lock — duplicate submits return 409
- [ ] Emit `v1:question` event with server-authoritative timestamp — clients can render countdown
- [ ] Round-end flush: write answers + scores to PostgreSQL, emit `v1:round_result`

### Android Agent
- [ ] Wire `WebSocketManager` → `GameViewModel` — all 10 WS events update `GameUiState`
- [ ] `GameScreen` countdown Canvas ring animation — depletes from server `ts` to deadline
- [ ] Answer selection locks after submit — UI disables buttons, shows locked state

### Web Agent
- [ ] Wire `gameStore` all 10 WS event handlers — each event updates correct store slice
- [ ] `GamePage` SVG countdown timer synced to server clock
- [ ] Answer lock after submit — buttons disabled, selected answer highlighted

---

## Backlog (Phase 1–2 items, not yet in sprint)

### Phase 1 Backlog
- BACKEND: Matchmaking queue — solo player auto-queued, matched within 10s or starts with bot
- BACKEND: Elimination logic wired into orchestrator
- BACKEND: XP writes via `XPFormula` at game end
- BACKEND: Integration tests for full game flow with mocked Redis
- ANDROID: Full Lobby → Game → Results navigation flow on emulator
- ANDROID: WS reconnect with exponential backoff — mid-game reconnect verified
- ANDROID: Room cache via Room DB (`GameCacheEntity`) for process-death recovery
- WEB: Full Lobby → Game → Results navigation flow in browser
- WEB: `ResultsPage` final standings with XP displayed
- WEB: Keyboard shortcuts 1–4 verified working in `GamePage`
- LEAD: k6 load test with 5 simulated players — `load-test/game-simulation.js` passes
- LEAD: P95 round-result latency < 300ms verified

### Phase 2 Backlog
- BACKEND: `PowerUpService` — validate inventory, consume, apply DOUBLE_DOWN, FIFTY_FIFTY, TIME_FREEZE, SHIELD, SABOTAGE effects
- BACKEND: Balance sim — 1000 simulated games, no power-up > 60% win rate
- ANDROID: Power-up tray (bottom sheet) + particle burst Canvas animation
- ANDROID: SoundPool SFX + haptic feedback
- WEB: Power-up tray hover card + CSS keyframe animations per power-up
- WEB: Web Audio API synthesized SFX
- WEB: Framer Motion phase transitions

---

## Definition of Done (all phases)

A ticket is "done" when:
1. Code is committed on the feature branch with a conventional commit message
2. The acceptance criterion in the ticket passes (verified by running the stated command or flow)
3. No new TypeScript errors introduced (`npm run typecheck` or `./gradlew assembleDebug`)
4. Technical Lead has confirmed the item in the integration checklist

---

## Branch Status

| Branch | Last Commit | Status |
|--------|------------|--------|
| `main` | `10c57cf` | Phase 2 hardening complete — all 7 routes mounted, rate limiting live, smoke:phase2 passed |
| `phase1/claude-leftoff-wip` | `892d13e` | Active work branch — tests, load-test, page improvements |
