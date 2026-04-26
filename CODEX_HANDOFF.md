# Quiz Royale Showdown - Codex Handoff

**Updated:** 2026-04-26  
**Primary repo:** `c:\Users\plugu\AndroidStudioProjects\QuizGame`  
**Status:** Phase 2 code complete. Full game loop (lobby → question → result → elimination → finale → game:over) is implemented and validated. Smoke test against live backend is the next gate.

---

## Repo Boundaries

- Primary app repo: `c:\Users\plugu\AndroidStudioProjects\QuizGame`
- Separate Railway question/data workspace: `c:\Users\plugu\AndroidStudioProjects\QuizGame-main\backend`

Do not mix these scopes. The Railway question audit belongs to `QuizGame-main\backend`, not the primary repo.

## Current Verified State

- Phase 1 smoke reaches `round:question_started`.
- Android CLI build passes (`android\gradlew.bat -p android :app:assembleDebug`).
- Backend: 34/34 tests pass. TypeScript exits 0.
- Webapp: TypeScript exits 0. Production build exits 0.
- `gameHandlers.ts` has been deleted; its logic lives in `backend/src/socket/handlers/` (submitAnswer, usePowerup, reconnect, playerReady).
- Android `parseRankings` fixed: display names are now preserved from the current player list across `round:result` transitions.
- `smoke:phase2` script is present at `load-test/phase2-full-loop-smoke.mjs` but has not yet been run against live backend.

The primary backend mounted launch surface is limited to:
  - `GET /health`
  - `/api/v1/auth/*`
  - `/api/v1/rooms/*`

Admin, meta, profile, leaderboard, cosmetics, shop, friends, push, and payment flows are future scope unless mounted in the primary backend and verified in smoke.

## Canonical Contract

- REST base: `/api/v1`
- Socket.IO path: `/ws`
- Socket event transport: `message` envelope
- Current proven live milestone: `round:question_started`

Keep web, Android, and backend on this contract. Avoid adding branch-local socket event variants.

## Question Database Note

Railway question audit is handled from:

```powershell
cd c:\Users\plugu\AndroidStudioProjects\QuizGame-main\backend
```

Current Railway audit status: 4,375 active questions.

Treat those question scripts/admin workflows as separate from the primary repo unless explicitly copied, mounted, and verified.

## What To Do Next

Run the Phase 2 smoke gate against a live backend with Postgres and Redis:

```powershell
cd c:\Users\plugu\AndroidStudioProjects\QuizGame
npm run smoke:phase2
```

The smoke expects:
- Backend at `http://localhost:4000` (or set `API_BASE_URL` / `WS_BASE_URL`)
- Postgres with an active question bank
- Redis for answer scoring and game state

After smoke passes, record the result in `docs/VERIFICATION_MATRIX.md` and the next focus is:
1. Wire up `smoke:phase2` to CI if running on a dev server.
2. Fix `CountdownRing` in `GameScreen.kt` — the arc is static and doesn't animate from `timerSeconds` state.
3. Consider making power-up inventory live-gated (only show owned power-ups) once the `powerup:loot_drop` backend event is emitted.
4. Profile / leaderboard / cosmetics routes remain future scope.

## Guardrails

- Docs ownership only for this handoff update.
- Do not revert concurrent work by other agents.
- Do not claim admin/profile/leaderboard/cosmetics/shop/friends/push are backend-supported in the primary repo unless they are mounted in `backend/src/app.ts`.
- Do not use `QuizGame-main\backend` question data as evidence that primary-repo admin routes exist.

## Useful Commands

```powershell
cd c:\Users\plugu\AndroidStudioProjects\QuizGame

# Android debug build
android\gradlew.bat -p android :app:assembleDebug

# Backend local work
cd backend
npm run typecheck
npm test

# Web local work
cd ..\webapp
npm run typecheck
npm run build
```
