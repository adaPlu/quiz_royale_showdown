# Quiz Royale Showdown — Codex Handoff

**Updated:** 2026-04-26  
**Primary repo:** `c:\Users\plugu\AndroidStudioProjects\QuizGame-main`  
**Branch:** `main` — HEAD `bbe1540`  
**Status:** Phase 2 complete. FIFTY_FIFTY client delivery wired. 94 backend + 15 webapp tests passing. TypeScript clean.

---

## Repo Boundaries

- All code lives in `c:\Users\plugu\AndroidStudioProjects\QuizGame-main` (monorepo).
- Workspaces: `backend/` (Node/Express/Prisma), `webapp/` (React/Vite), `android/` (Kotlin/Compose).
- `main` is the integration branch. Push only after build + tests pass.
- Stale `worktree-agent-*` branches on remote — safe to delete, all their work is already in main.

---

## Current Verified State (2026-04-26)

### Backend — 94/94 tests, TypeScript clean

- All 11 routes mounted and rate-limited (`authLimiter` 20/15 min, `apiLimiter` 120/min).
- Full game loop: countdown → questions → answers → eliminations → finale → `game:over` → XP writes → SeasonScore upsert.
- Bot fill: `waitForPlayersOrFillBots` waits 10s then injects `QuizBot` if < 2 humans.
- `powerup:loot_drop` emitted to each finalist after `game:over` with random power-up type, quantity 1.
- **Power-up server enforcement:** `submitAnswer.ts` calls `powerUpService` on every answer:
  - `SABOTAGE`: forces `isCorrect = false` regardless of submitted index
  - `DOUBLE_DOWN`: multiplies `scoreDelta` by stored Redis multiplier (2×) for correct answers only
  - `TIME_FREEZE`: extends per-player deadline by `timeBoostMs` from Redis key, then consumes it
  - `SHIELD`: `GameOrchestrator` filters shielded players from elimination wave, consumes shield after
- `PowerUpService.activatePowerUp()` is the single authority: inventory check → atomic decrement → Redis effect flag → `PowerUpUse` DB record.
- `usePowerup.ts` handler delegates entirely to `powerUpService.activatePowerUp()`, emits `powerup:effect` to room and `powerup:effect_private` to activating socket (FIFTY_FIFTY masked indices).

### Webapp — 12/12 tests, TypeScript clean

- All pages live and hitting real endpoints: LeaderboardPage (`/leaderboard`), ProfilePage (`/users/me`).
- `PowerUpTray` emits `powerup:activate` with uppercase backend enum names (`FIFTY_FIFTY`, `SHIELD`, `TIME_FREEZE`, `DOUBLE_DOWN`) — was sending lowercase UI type before.
- `useGameSocket.ts`: all 10 game events wired. Duplicate `powerup:loot_drop` handler removed (first copy was passing whole payload object as `powerupType` arg — bug).
- `gameStore.powerupInventory` tracks loot drops; `GamePage` gates `owned` state against inventory counts.
- Keyboard shortcuts 1–4 submit answers in `GamePage`.
- **Vitest configured** — run: `cd webapp && npm run test`.

### Android — assembleDebug passes

- `WebSocketManager`: exponential backoff (2^n × 1000ms, max 30s, 8 attempts). Emits v1 envelope `{"type":"reconnecting","version":"v1","payload":{"attempt":N}}` on each retry.
- `GameViewModel`: handles all WS events. Loads/saves `powerupInventory` to Room DB (`GameCacheEntity.powerupInventoryJson`) across process death. Clears stale inventory on `joinRoom`.
- `GameScreen`: animated `CountdownRing` via `animateFloatAsState`. Reconnect banner shown when `isReconnecting = true`.

---

## What's Done vs Open (as of 2026-04-26)

### Completed This Session
- `useGameSocket.ts` — `powerup:effect_private` handler wired; calls `applyFiftyFiftyMask(maskedAnswerIndices)`
- `gameStore.ts` — `applyFiftyFiftyMask(indices)` setter added (state field `fiftyFiftyEliminated` already existed)
- `GamePage.tsx` — already reads `fiftyFiftyEliminated` and applies `opacity-30 cursor-not-allowed` (no change needed)
- `gameStore.test.ts` — 3 new tests for `applyFiftyFiftyMask` (15 total webapp tests, up from 12)
- `backend/src/types/contracts.ts` — `powerup:effect` + `powerup:effect_private` added to `ServerEvents` union
- `docs/PHASED_PLAN.md` — Phase 2 backend + webapp items marked complete

### Still Open (Next Agent)

| Item | Priority | Notes |
|---|---|---|
| k6 P95 measurement | High | Script at `load-test/game-simulation.js`, never run live. Target < 300ms. |
| Smoke test live run | High | `node load-test/phase2-full-loop-smoke.mjs` against running backend |
| Railway live smoke | User | Needs Railway URL + env vars in Railway dashboard |
| 5-player game | User | Requires 5 real clients |
| Android device E2E | User | Code correct, needs physical device/emulator run |
| Phase 2 animation polish | Deferred | SFX, particle burst, haptic — Sprint 8 scope |
| `PowerUpBalancer` rarity rates | Deferred | Not started; backend `PowerUpBalancer` class exists but not wired to loot |

---

## Test Commands

```sh
# Backend (run from backend/ directory)
cd backend && npx vitest run

# Webapp
cd webapp && npm run test

# Android
./gradlew :android:app:assembleDebug

# Smoke (local backend must be running)
node load-test/phase2-full-loop-smoke.mjs

# k6 load test
k6 run --env API_BASE_URL=http://localhost:3000/api/v1 load-test/game-simulation.js
```

---

## Key File Locations

| What | Where |
|---|---|
| Socket handlers | `backend/src/socket/handlers/` (submitAnswer, usePowerup, reconnect, playerReady) |
| Power-up service | `backend/src/services/PowerUpService.ts` |
| Game loop | `backend/src/services/GameOrchestrator.ts` |
| Room service + bot fill | `backend/src/services/RoomService.ts` |
| Socket type contracts | `backend/src/types/contracts.ts` |
| WebSocket contract | `webapp/src/lib/contracts.ts` |
| Game store | `webapp/src/stores/gameStore.ts` |
| Socket hook | `webapp/src/hooks/useGameSocket.ts` |
| PowerUpTray component | `webapp/src/components/PowerUpTray.tsx` |
| GamePage | `webapp/src/pages/GamePage.tsx` |
| Android WS manager | `android/app/src/main/java/com/quizroyale/showdown/data/socket/WebSocketManager.kt` |
| Android game VM | `android/app/src/main/java/com/quizroyale/showdown/ui/game/GameViewModel.kt` |
| k6 load test | `load-test/game-simulation.js` |
| Smoke tests | `load-test/phase2-full-loop-smoke.mjs` |
| Railway start | `backend/start.sh` |
| Phase plan | `docs/PHASED_PLAN.md` |

---

## Three Overlapping Init Migrations

Migrations `20260419165003_init`, `20260422211153_init`, `20260425000000_init` are all full schema dumps. `start.sh` marks all three as `--applied` before `migrate deploy` so Railway never double-runs them. Do not delete any of these files.

---

## Recent Commit History

```
bbe1540 docs: update CODEX_HANDOFF — Phase 2 power-up enforcement complete, 94+12 tests
81f6e2b feat: consume power-up Redis flags in scoring/elimination + first webapp tests
5c60a44 feat(android): persist powerup inventory to Room DB across process death
1f64956 feat: commit deferred session work — SeasonScore, bot fill, live leaderboard/profile pages, vitest setup
928d6d8 fix(powerups): wire usePowerup handler through PowerUpService + fix tray type mapping
72e38e6 feat: bot fill wired + WS reconnect envelope + keyboard shortcuts + SeasonScore
```
