# Quiz Royale Showdown - Current State to Launch Plan

**Last Updated:** 2026-04-25  
**Owner:** Technical Lead  
**Scope:** Ground-to-launch status for the primary repo at `c:\Users\plugu\AndroidStudioProjects\QuizGame`.

---

## 1. Current Status

Phase 1 recovery is verified through the first live gameplay event. The smoke flow reaches `round:question_started` against the live backend contract.

The repo is no longer in scaffold recovery. It is now in Phase 2 full-game hardening: finish and repeatedly verify the full multiplayer loop through answers, round results, eliminations, game over, reconnect/resync, and client result screens.

## 2. Mounted Backend Surface

Only treat these routes as mounted and launch-relevant in the primary repo:

- `GET /health`
- `/api/v1/auth/*`
- `/api/v1/rooms/*`

Admin, meta, profile, leaderboard, cosmetics, shop, friends, push, and related systems are future scope unless the backend mounts them in `backend/src/app.ts` and they are smoke-tested against the deployed/runtime contract.

## 3. Verified Gates

- Backend route surface: health, auth, and rooms only.
- Socket smoke: Phase 1 reaches `round:question_started`.
- Android CLI build: passes with `android\gradlew.bat -p android :app:assembleDebug`.
- Web/backend/Android should continue to use the canonical Socket.IO `/ws` path and `message` envelope contract.

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

**Status:** Current focus.

Goal: Make the full live multiplayer loop reliable on the canonical contract.

Exit criteria:
- 2-5 players can complete a full game against the live backend.
- Answer submission, answer locking, round results, eliminations, finale, game over, XP/result payloads, and results screens work without contract drift.
- Web and Android both stay in sync through lobby -> game -> results.
- Reconnect/resync works from lobby and active game states.
- Backend game state, Redis timers, room lifecycle, and persistence writes are repeatable locally and in smoke verification.
- Docs/contracts describe the code that is actually mounted and running.

Recommended order:
1. Backend: harden `GameOrchestrator`, answer submission, round result flush, elimination, game-over, and reconnect state.
2. Web: verify full live flow through results and remove/guard non-mounted feature calls from the launch path.
3. Android: verify room -> game -> results on the same socket envelopes after each backend contract change.
4. Lead: run the multiplayer smoke gate and reject changes that add unmounted or undocumented route assumptions.

Current Phase 2 work packages:
- Backend full-loop proof: add/extend smoke coverage from room start through answer submit, `round:result`, elimination/finale when applicable, `game:over`, XP/result writes, and cleanup.
- Backend reconnect/resync proof: verify `room:state_sync` is deterministic from lobby and active-game states after socket reconnect.
- Web launch-path guard: keep profile/global leaderboard/power-up inventory out of the required path until endpoints exist, while preserving local in-game standings/results.
- Android event parity: parse backend payloads exactly, especially `round:elimination.eliminatedPlayerIds`, `room:player_joined`, `room:player_left`, `room:state_sync`, and `error`.
- Contract cleanup: if power-ups remain visible, either add canonical `powerup:*` server envelopes to backend/web/Android contracts or hide activation from the launch smoke path.
- Verification: rerun backend tests, web typecheck/build, Android debug build, Phase 1 smoke, Railway question audit, then add the Phase 2 full-loop smoke.

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

- Full-game smoke beyond `round:question_started` is still the main unknown.
- Any UI that calls profile, leaderboard, cosmetics, shop, friends, push, or admin routes must be guarded, mocked locally, or removed from the launch path until those routes are mounted.
- Railway question operations are split across a separate repo; keep primary-repo launch work distinct from `QuizGame-main\backend` data maintenance.
- Contract drift risk remains highest around socket event names, payload shape, and direct non-envelope Socket.IO emissions.
- The claim "all launch blockers are fixed" is too broad until the full-loop staging smoke, reconnect scenario, and production/Railway question audit have current passing results.

## 7. Next Action

Begin Phase 2 with a full-game smoke harness/checklist. The next accepted milestone is not another scaffold milestone; it is a verified game that proceeds from room creation through `game:over` and results on the mounted backend contract.
