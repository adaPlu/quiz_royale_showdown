# Sprint Board

**Last Updated:** 2026-04-18
**Current Phase:** 0 — Foundation
**Lead:** Technical Lead

---

## Current Sprint: Phase 0 Week 2 (Completion Sprint)

### Backend Agent (feature/backend)
- [ ] Write `src/routes/powerups.ts` — GET /powerups/inventory returns 200 with inventory array
- [ ] Write `src/routes/cosmetics.ts` — GET /cosmetics returns array of cosmetic objects
- [ ] Write `src/routes/users.ts` — GET /users/me returns user object with id, username, xp, level
- [ ] Write `src/scripts/seedQuestions.ts` — fetches + inserts 500 questions from Open Trivia DB API in batches of 50
- [ ] `npm install && prisma migrate dev --name init` — no migration errors, 15 tables created
- [ ] `npm run dev` — GET /health returns `{ "status": "ok", "ts": <epoch>, "version": "1.0.0" }`
- [ ] `npm run build` — zero TypeScript errors
- [ ] Commit `feat(backend): Phase 0 complete` and push `feature/backend`

### Android Agent (feature/android)
- [ ] Write `data/remote/model/WsEnvelope.kt` — data class with eventType, roomId, senderId, ts, payload: JsonObject
- [ ] Write `data/remote/model/WsEvent.kt` — sealed class with all 10 WS event subclasses
- [ ] Write `data/remote/model/AuthModels.kt` — data classes: LoginRequest, RegisterRequest, TokenResponse
- [ ] Write `ui/lobby/LobbyViewModel.kt` — MVI ViewModel for LobbyScreen, WS events update player list state
- [ ] Write `ui/game/GameSideEffect.kt` — sealed class: HapticFeedback, ShowToast, ShowLevelUp
- [ ] Write `ui/screens/home/HomeScreen.kt` + `HomeViewModel.kt` — Create Room + Join by Code + Quick Play, POST /rooms + POST /rooms/join via Retrofit
- [ ] Write `ui/screens/results/ResultsScreen.kt` + `ResultsViewModel.kt` — final leaderboard, XP bar animation, Play Again CTA
- [ ] `./gradlew assembleDebug` — build succeeds with no errors
- [ ] App runs on emulator: splash → login → home (all 3 screens reachable without crash)
- [ ] Commit `feat(android): Phase 0 complete` and push `feature/android`

### Web Agent (feature/webapp)
- [ ] Write `src/pages/LoginPage.tsx` — React Hook Form + Zod, POST /auth/login, stores token in authStore
- [ ] Write `src/pages/RegisterPage.tsx` — username + email + password + confirmPassword validation, POST /auth/register
- [ ] Write `src/pages/HomePage.tsx` — Quick Play + Create Room + Join by Code, authenticated route
- [ ] Write `src/pages/ResultsPage.tsx` — final leaderboard, XP summary, share button
- [ ] Write `src/pages/ProfilePage.tsx` — avatar, XP ring, stats, season rank (stub OK for Phase 3)
- [ ] Write `src/pages/LeaderboardPage.tsx` — tabs: Global/Season/Friends, react-window virtual list
- [ ] Write `src/components/XpBar.tsx` — animated progress bar with brand gradient (#6C3EF5)
- [ ] Write `src/components/SeasonRankBadge.tsx` — colored tier badge component
- [ ] Write `src/stores/profileStore.ts` — Zustand store: level, xp, equippedCosmeticIds
- [ ] Write `vercel.json` — SPA rewrite rule: all routes → index.html
- [ ] `npm run typecheck` — zero TypeScript errors
- [ ] `npm run dev` — login page loads at localhost:5173 with no console errors
- [ ] Commit `feat(webapp): Phase 0 complete` and push `feature/webapp`

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
| `main` | `80cd2e0` — Codex handoff doc | Awaiting merges |
| `feature/backend` | `e02108b` — Phase 0 scaffold | 4 routes missing, needs build verification |
| `feature/android` | `e02108b` — Phase 0 scaffold | 9 files missing, needs assembleDebug |
| `feature/webapp` | `80cd2e0` — Codex handoff | 10 files missing, needs typecheck |
