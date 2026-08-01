# Quiz Royale Showdown - Current State to Launch Plan

**Last Updated:** 2026-07-29
**Owner:** Technical Lead  
**Scope:** Ground-to-launch status for the primary repo at `c:\Users\plugu\AndroidStudioProjects\QuizGame`.

---

## 1. Current Status

Phase 1 recovery is verified through the first live gameplay event. The Phase 2 full-loop smoke is also verified: `smoke:phase2` completed 10 rounds through finale, `game:over`, XP writes, and scoring on 2026-04-26.

The repo is no longer in scaffold recovery or core-loop recovery. It is now in launch hardening: keep the verified core game loop stable while preparing staging/production deployment, tuning already-wired rate limits, client polish, and production smoke checks.

## 2. Mounted Backend Surface

Mounted routes in the primary repo:

- `GET /health`
- `/api/v1/auth/*`
- `/api/v1/admin/*`
- `/api/v1/challenges/*`
- `/api/v1/cosmetics/*`
- `/api/v1/leaderboard/*`
- `/api/v1/powerups/*`
- `/api/v1/push/*`
- `/api/v1/rooms/*`
- `/api/v1/users/*`

Launch-critical smoke remains centered on health, auth, rooms, and Socket.IO `/ws`. Profile/users, leaderboard, cosmetics, power-ups, challenges, push, and admin are implemented backend surfaces, but they still need deployment-specific smoke evidence before they should be treated as production launch blockers or beta commitments. Shop, friends, payments, and seasons remain unmounted/future scope.

## 3. Verified Gates

- Backend route surface: health, auth, rooms, users/profile, leaderboard, cosmetics, power-ups, challenges, push, and admin are mounted.
- Socket smoke: Phase 1 reaches `round:question_started`; Phase 2 reaches `game:over`.
- Android CLI build: passes with `android\gradlew.bat -p android :app:assembleDebug`.
- Web/backend/Android should continue to use the canonical Socket.IO `/ws` path and `message` envelope contract.

## 4. Data Note

Railway question-bank audit belongs to the separate backend workspace:

`c:\Users\plugu\AndroidStudioProjects\QuizGame-main\backend`

That Railway database currently audits at 4,375 active questions. Do not assume those scripts or question-admin routes exist in the primary repo unless they are explicitly present and mounted there.

## 5. Phase Plan

### Phase 1 - Contract Recovery and Launch Foundation

**Status:** Accepted for recovery.

Evidence:
- Auth and room routes are mounted under `/api/v1`.
- Live socket flow reaches `round:question_started`.
- Android debug build is reproducible from CLI.
- Stale backend direct `v1:*` socket handler code has been removed from the active backend source.
- Contract docs distinguish mounted profile, leaderboard, admin, cosmetics, power-ups, challenges, and push routes from still-future shop, friends, seasons, and payments.

Residual work belongs in launch hardening unless it regresses first-question smoke.

### Phase 2 - Full Game Hardening

**Status:** Verified for the core loop.

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

Verified evidence:
- `smoke:phase2` completed 10 rounds through `round:finale_started` and `game:over`.
- Backend tests cover core game mechanics, reconnect, answer submission, room recovery, power-up service behavior, and SeasonScore updates.
- Web typecheck/build and Android `assembleDebug` are passing.

Remaining work is no longer Phase 2 recovery; it is launch hardening.

### Phase 3 - Launch Hardening and Staging

**Status:** Current focus.

Exit criteria:
- Primary repo backend is deployed to Railway with `GET /health` green.
- Staging/production smoke passes for auth, room create/join/start, `/ws`, first question, and full-loop smoke where practical.
- Auth/API rate limiting is active; keep coverage focused on limiter ordering and status/body regressions.
- Android debug build remains green with Socket.IO reconnect/backoff.
- Web production builds require `VITE_API_BASE_URL`; only local Vite development falls back to `http://localhost:4000/api/v1`.
- Web launch path avoids relying on unsmoked or unmounted meta endpoints for core room/game/results completion.
- Railway question audit is current and reports the expected active question bank.
- Rollback/deploy notes are documented.

### Phase 4 - Android Gameplay Parity and Recovery

Start after staging backend deployment is stable.

Exit criteria:
- Android completes auth -> home/lobby -> game -> results end to end against staging.
- Android reconnect/process-death behavior is acceptable for beta.
- Android event parsing matches the same contract used by web.

### Phase 5 - Meta Systems and Payments

Future scope.

Only start after the core loop is stable in staging. Includes broad beta commitment for profile, leaderboard, cosmetics, progression, shop, purchases, inventory, and related backend endpoints. Some of these routes are already mounted locally, but production readiness still requires staging smoke and launch acceptance.

### Phase 6 - Friends, Push, PWA, Public Launch

Future scope.

Includes friends, push notifications, invite links, web PWA polish, accessibility, load tests, security review, crash monitoring, staging rollout, and public launch operations.

## 6. High-Risk Gaps

- Staging/production deployment is now the main unknown.
- Any UI that calls profile, leaderboard, cosmetics, power-ups, challenges, push, or admin routes must not block the core launch path until those routes are deployed and smoke-tested. UI that calls shop, friends, payments, or seasons must remain guarded, mocked locally, or hidden until routes are mounted.
- Production web deployment will fail at runtime if `VITE_API_BASE_URL` is missing; this must be set to the intended API origin before Vercel launch.
- Railway question operations are split across a separate repo; keep primary-repo launch work distinct from `QuizGame-main\backend` data maintenance.
- Contract drift risk remains highest around socket event names, payload shape, and direct non-envelope Socket.IO emissions.
- The claim "all launch blockers are fixed" is too broad until staging deployment, reconnect scenario, and production/Railway question audit have current passing results.

## 7. Next Action

Begin launch hardening with a primary-repo Railway deployment and staging smoke. The next accepted milestone is not more local core-loop recovery; it is a deployed backend with health/auth/room/socket/full-loop checks passing against the canonical contract.
