# Quiz Royale Showdown - Codex Handoff

**Updated:** 2026-04-25  
**Primary repo:** `c:\Users\plugu\AndroidStudioProjects\QuizGame-main`  
**Status:** Phase 2 VERIFIED. Full game loop smoke passed end-to-end on 2026-04-26 (10 rounds, finale, game:over, XP writes, both players scored correctly). All 7 previously unmounted routes are now live. Rate limiting is active. CountdownRing is animated. Loot drops are wired.

---

## Repo Boundaries

- Primary app repo: `c:\Users\plugu\AndroidStudioProjects\QuizGame`
- Separate Railway question/data workspace: `c:\Users\plugu\AndroidStudioProjects\QuizGame-main\backend`

Do not mix these scopes. The Railway question audit belongs to `QuizGame-main\backend`, not the primary repo.

## Current Verified State

- Phase 1 smoke reaches `round:question_started`. Phase 2 smoke passed full loop to `game:over`.
- Android CLI build passes (`android\gradlew.bat -p android :app:assembleDebug`).
- Backend: 34/34 tests pass. TypeScript exits 0.
- Webapp: TypeScript exits 0. Production build exits 0.
- `gameHandlers.ts` has been deleted; its logic lives in `backend/src/socket/handlers/` (submitAnswer, usePowerup, reconnect, playerReady).
- Android `parseRankings` fixed: display names are now preserved from the current player list across `round:result` transitions.
- `smoke:phase2` PASSED on 2026-04-26 — 10 rounds, finale, `game:over`, XP writes, scoring all verified.
  Run: `DATABASE_URL=<railway-postgres> REDIS_URL=redis://localhost:6379 npm run dev:backend` (local Redis via Docker), then `npm run smoke:phase2`.
- **CountdownRing** (`GameScreen.kt`) is animated: `animateFloatAsState` drives the sweep angle from `timerSeconds` state — no longer static.
- **`powerup:loot_drop`** is emitted by `GameOrchestrator` after `game:over` to each finalist with a random power-up type and quantity 1.
- **Webapp `gameStore`** tracks `powerupInventory: Record<string, number>`. `GamePage` reads `powerupInventory` from the store and gates each power-up's `owned` state against actual inventory counts — power-ups with zero inventory show as unowned.
- **Rate limiting** is live via `express-rate-limit`: `authLimiter` (20 req / 15 min) on `/api/v1/auth`; `apiLimiter` (120 req / 1 min) on all `/api/v1`.

The primary backend mounted launch surface now includes:
  - `GET /`
  - `GET /health`
  - `/api/v1/auth/*`
  - `/api/v1/rooms/*`
  - `/api/v1/users/*`
  - `/api/v1/powerups/*`
  - `/api/v1/cosmetics/*`
  - `/api/v1/leaderboard/*`
  - `/api/v1/challenges/*`
  - `/api/v1/push/*`
  - `/api/v1/admin/*`

Shop, friends, seasons, and payment flows remain future scope (not mounted in `backend/src/app.ts`).

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

Phase 2 is verified and the following items from the previous TODO list are now DONE:

- [x] **`CountdownRing` animation** — `animateFloatAsState` drives the sweep angle in `GameScreen.kt`. No longer static.
- [x] **Power-up inventory gating** — Webapp `GamePage` gates each power-up's `owned` flag against `powerupInventory` from `gameStore`. Backend emits `powerup:loot_drop` after `game:over`.
- [x] **Rate limiting** — `authLimiter` (20 req / 15 min) and `apiLimiter` (120 req / 1 min) are live in `backend/src/middleware/rateLimiter.ts` and applied in `app.ts`.
- [x] **Routes mounted** — All 7 previously unmounted routes (`/api/v1/users`, `/api/v1/powerups`, `/api/v1/cosmetics`, `/api/v1/leaderboard`, `/api/v1/challenges`, `/api/v1/push`, `/api/v1/admin`) are now live in `app.ts`.

The next phase is **launch hardening**:

1. **Deploy the primary backend to Railway** — the current Railway deployment (if any) is from the `QuizGame-main` repo; the primary repo (`QuizGame-main`) needs its own Railway service wired to the same Postgres + Redis.
2. **Shop, friends, seasons, and payments** — not yet mounted. These remain Phase 3/4 scope.
3. **End-to-end Android gameplay parity** — verify Android completes auth → lobby → game → results on device against the live backend.
4. **Reconnect/resync hardening** — confirm `room:state_sync` is deterministic after mid-game reconnect on both web and Android.

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
