# Quiz Royale Showdown - Current State to Launch Plan

**Last Updated:** 2026-04-25  
**Owner:** Technical Lead  
**Scope:** Ground-to-launch status for the primary repo at `c:\Users\plugu\AndroidStudioProjects\QuizGame-main`.

---

## 1. Current Status

Phase 2 is verified. The smoke flow completes the full loop through `game:over` against the live backend contract (`smoke:phase2` PASSED 2026-04-26).

The following hardening items are complete:
- All 7 previously unmounted routes are now live: `/api/v1/users`, `/api/v1/powerups`, `/api/v1/cosmetics`, `/api/v1/leaderboard`, `/api/v1/challenges`, `/api/v1/push`, `/api/v1/admin`
- Rate limiting is active: `authLimiter` (20 req / 15 min) on auth; `apiLimiter` (120 req / 1 min) on all `/api/v1`
- `CountdownRing` in Android is animated with `animateFloatAsState`
- Backend emits `powerup:loot_drop` after `game:over` to each finalist
- Webapp `gameStore` tracks `powerupInventory`; `GamePage` gates power-up owned state against actual inventory

The repo is now entering launch hardening: Railway deployment, reconnect/resync verification, Android end-to-end flow, and Phase 3 meta systems.

## 2. Mounted Backend Surface

All of the following routes are mounted and live in `backend/src/app.ts`:

- `GET /`
- `GET /health`
- `/api/v1/auth/*` — rate-limited: 20 req / 15 min per IP
- `/api/v1/rooms/*`
- `/api/v1/users/*`
- `/api/v1/powerups/*`
- `/api/v1/cosmetics/*`
- `/api/v1/leaderboard/*`
- `/api/v1/challenges/*`
- `/api/v1/push/*`
- `/api/v1/admin/*`

All `/api/v1` routes share a general rate limit of 120 req / 1 min per IP.

Shop, friends, seasons, and payment routes remain future scope (not yet mounted).

## 3. Verified Gates

- Backend route surface: health, auth, rooms, users, powerups, cosmetics, leaderboard, challenges, push, admin — all mounted.
- Rate limiting: `authLimiter` + `apiLimiter` active.
- Socket smoke: Phase 1 reaches `round:question_started`; Phase 2 smoke completes full loop to `game:over`.
- Android CLI build: passes with `android\gradlew.bat -p android :app:assembleDebug`.
- `CountdownRing` animated with `animateFloatAsState` in Android.
- Backend emits `powerup:loot_drop` after `game:over`; webapp `gameStore` and `GamePage` handle it.
- Web/backend/Android continue to use the canonical Socket.IO `/ws` path and `message` envelope contract.

## 4. Data Note

Railway question-bank audit belongs to the separate backend workspace:

`c:\Users\plugu\AndroidStudioProjects\QuizGame-main\backend`

That Railway database currently audits at 4,375 active questions. Do not assume those scripts or question-admin routes exist in the primary repo unless they are explicitly present and mounted there.

## 5. Phase Plan

### Phase 1 - Contract Recovery and Launch Foundation

**Status:** Accepted for recovery, not accepted for launch.

Evidence:
- Auth and room routes are mounted under `/api/v1`.
- Live socket flow reaches `round:question_started`.
- Android debug build is reproducible from CLI.
- Stale backend direct `v1:*` socket handler code has been removed from the active backend source.
- Contract docs now mark profile, leaderboard, admin, cosmetics, shop, friends, push, and payments as future/unmounted.

Residual work belongs in Phase 2 unless it blocks first-question smoke.

### Phase 2 - Full Game Hardening

**Status:** COMPLETE (smoke:phase2 PASSED 2026-04-26).

Verified exit criteria:
- [x] Full game loop (10 rounds, eliminations, finale, game:over, XP writes) verified in `smoke:phase2`
- [x] All 7 previously unmounted routes are now live
- [x] Rate limiting active
- [x] `CountdownRing` animated
- [x] `powerup:loot_drop` emitted and consumed by webapp
- [x] Docs/contracts updated to reflect actually mounted code

Remaining before M2 is fully closed:
- [ ] WS reconnect/resync verified mid-game (not yet smoke-tested)
- [ ] 5-player game (smoke only runs 2-player simulation)
- [ ] P95 latency < 300ms (k6 not yet run)
- [ ] Android end-to-end flow on device

### Phase 3 - Android Gameplay Parity and Recovery

Start after the Phase 2 web/backend loop is stable.

Exit criteria:
- Android completes auth -> home/lobby -> game -> results end to end.
- Android reconnect/process-death behavior is acceptable for beta.
- Android event parsing matches the same contract used by web.

### Phase 4 - Meta Systems and Payments

Future scope.

Only start after the core loop is stable. Includes profile, leaderboard, cosmetics, progression, shop, purchases, inventory, and related backend endpoints.

### Phase 5 - Friends, Push, PWA, Hardening, Launch

Future scope.

Includes friends, push notifications, invite links, web PWA polish, accessibility, load tests, security review, crash monitoring, staging rollout, and public launch operations.

## 6. High-Risk Gaps

- WS reconnect/resync mid-game has not been smoke-tested — this is the primary remaining unknown.
- Android end-to-end flow on device has not been verified beyond assembleDebug passing.
- P95 latency under multi-player load has not been measured (k6 load test pending).
- Shop, friends, seasons, and payment routes remain unmounted — UI calling these must stay guarded.
- Railway question operations remain split across a separate repo (`QuizGame-main\backend`); keep primary-repo launch work distinct from that data maintenance workspace.

## 7. Next Action

Phase 2 hardening is complete. Recommended next steps:

1. **Railway deployment** — deploy the primary backend to its own Railway service.
2. **Reconnect smoke** — verify `room:state_sync` is deterministic after mid-game socket reconnect on both web and Android.
3. **Android device flow** — run auth → lobby → game → results on a real device or emulator against the live backend.
4. **k6 load test** — run `load-test/game-simulation.js` to validate P95 latency < 300ms under 5-player load.
