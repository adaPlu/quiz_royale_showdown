# Quiz Royale Showdown — Codex Handoff

**Updated:** 2026-04-26  
**Primary repo:** `c:\Users\plugu\AndroidStudioProjects\QuizGame-main`  
**Branch:** `main` — HEAD `81f6e2b`  
**Status:** Phase 2 server power-ups ENFORCED. All 4 effects now applied in game loop. 94 backend + 12 webapp tests passing. Working tree clean.

---

## Repo Boundaries

- All code lives in `c:\Users\plugu\AndroidStudioProjects\QuizGame-main` (monorepo).
- Workspaces: `backend/` (Node/Express/Prisma), `webapp/` (React/Vite), `android/` (Kotlin/Compose).
- `main` is the integration branch. Push only after build + tests pass.
- Stale `worktree-agent-*` branches exist on remote — safe to delete, all their work is in main.

---

## Current Verified State (2026-04-26)

### Backend — 94/94 tests, TypeScript clean
- All 11 routes mounted and rate-limited (`authLimiter` 20/15 min, `apiLimiter` 120/min).
- Full game loop: countdown → questions → answers → eliminations → finale → `game:over` → XP writes → SeasonScore upsert.
- Bot fill: `waitForPlayersOrFillBots` waits 10s then injects `QuizBot` if < 2 humans.
- `powerup:loot_drop` emitted to each finalist after `game:over` with random power-up type, quantity 1.
- **Power-up server enforcement (NEW):** `submitAnswer.ts` now calls `powerUpService`:
  - `SABOTAGE`: forces `isCorrect = false` regardless of submitted answer
  - `DOUBLE_DOWN`: multiplies `scoreDelta` by the stored multiplier (2×) for correct answers
  - `TIME_FREEZE`: extends per-player deadline by `timeBoostMs` from Redis, then consumes key
  - `SHIELD`: `GameOrchestrator` filters shielded players from elimination wave, consumes shield
- `PowerUpService.activatePowerUp()` handles full inventory check + atomic decrement + Redis effect flags + `PowerUpUse` DB record.
- `usePowerup.ts` socket handler delegates entirely to `powerUpService.activatePowerUp()`, emits `powerup:effect` to room and `powerup:effect_private` for FIFTY_FIFTY masked indices.

### Webapp — 12/12 tests, TypeScript clean
- All pages live: GamePage, LobbyPage, ResultsPage, LeaderboardPage (hits `/leaderboard`), ProfilePage (hits `/users/me`).
- `gameStore.powerupInventory` tracks loot drops; `GamePage` gates power-up `owned` against inventory.
- `PowerUpTray` emits `powerup:activate` with uppercase backend enum (`FIFTY_FIFTY`, `SHIELD`, etc.) — fixed bug where lowercase UI type was sent.
- `useGameSocket.ts`: `room:state_sync` and all 10 game events wired. Duplicate `powerup:loot_drop` handler removed (was passing whole payload as `powerupType`).
- Keyboard shortcuts 1–4 submit answers in `GamePage`.
- **Vitest configured** (`vite.config.ts` test block, `package.json` vitest `^3.0.0`). Run: `cd webapp && npm run test`.

### Android — assembleDebug passes
- `WebSocketManager`: exponential backoff (2^n × 1000ms, max 30s, 8 attempts). Emits `{"type":"reconnecting","version":"v1","payload":{"attempt":N}}` on each retry.
- `GameViewModel`: handles all WS events. Inventory persistence — loads/saves `powerupInventory` to Room DB (`GameCacheEntity.powerupInventoryJson`) across process death. Clears on `joinRoom`.
- `GameScreen`: animated `CountdownRing` via `animateFloatAsState`. Reconnect overlay shown when `isReconnecting = true`.

---

## Test Commands

```sh
# Backend (94 tests)
cd backend && npx vitest run

# Webapp (12 tests)
cd webapp && npm run test

# Android
./gradlew :android:app:assembleDebug
```

---

## What's Not Done (Phase 2 gate still open)

| Item | Status |
|---|---|
| FIFTY_FIFTY effect: client gets `powerup:effect_private` with `maskedAnswerIndices` — webapp must hide those options | Not wired in gameStore/GamePage |
| Railway deploy smoke test against live URL | Not run this session |
| k6 load test against Railway | Script at `load-test/game-simulation.js` — never run live |
| 5-player game test | Only 2-player smoke verified |
| P95 < 300ms latency gate | k6 not run |
| Android E2E on real device | Code correct, not device-tested |

---

## Key File Locations

| What | Where |
|---|---|
| Socket handlers | `backend/src/socket/handlers/` (submitAnswer, usePowerup, reconnect, playerReady) |
| Power-up service | `backend/src/services/PowerUpService.ts` |
| Game loop | `backend/src/services/GameOrchestrator.ts` |
| Room service + bot fill | `backend/src/services/RoomService.ts` |
| WebSocket contract | `webapp/src/lib/contracts.ts` |
| Game store | `webapp/src/stores/gameStore.ts` |
| Socket hook | `webapp/src/hooks/useGameSocket.ts` |
| Android WS manager | `android/app/src/main/java/com/quizroyale/showdown/data/socket/WebSocketManager.kt` |
| Android game VM | `android/app/src/main/java/com/quizroyale/showdown/ui/game/GameViewModel.kt` |
| k6 load test | `load-test/game-simulation.js` |
| Smoke tests | `load-test/phase2-full-loop-smoke.mjs` |
| Railway start | `backend/start.sh` (marks 3 overlapping init migrations applied, then `migrate deploy`) |

---

## Three Overlapping Init Migrations

Migrations `20260419165003_init`, `20260422211153_init`, `20260425000000_init` are all full schema dumps. `start.sh` marks all three as `--applied` before `migrate deploy` so Railway never double-runs them. Do not delete any of these files.

---

## Branch History (recent)

```
81f6e2b feat: consume power-up Redis flags in scoring/elimination + first webapp tests
5c60a44 feat(android): persist powerup inventory to Room DB across process death
1f64956 feat: commit deferred session work — SeasonScore, bot fill, live leaderboard/profile pages, vitest setup
928d6d8 fix(powerups): wire usePowerup handler through PowerUpService + fix tray type mapping
72e38e6 feat: bot fill wired + WS reconnect envelope + keyboard shortcuts + SeasonScore
```
