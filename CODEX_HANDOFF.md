# Quiz Royale Showdown - Codex Handoff

**Updated:** 2026-05-01
**Primary repo:** `c:\Users\plugu\AndroidStudioProjects\QuizGame`  
**Status:** Phase 2 VERIFIED. Full game loop smoke passed end-to-end on 2026-04-26 (10 rounds, finale, game:over, XP writes, both players scored correctly).

---

## Repo Boundaries

- Primary app repo: `c:\Users\plugu\AndroidStudioProjects\QuizGame`
- Separate Railway question/data workspace: `c:\Users\plugu\AndroidStudioProjects\QuizGame-main\backend`

Do not mix these scopes. The Railway question audit belongs to `QuizGame-main\backend`, not the primary repo.

## Current Verified State

- Phase 1 smoke reaches `round:question_started`.
- Android CLI build passes (`android\gradlew.bat -p android :app:assembleDebug`).
- Backend: TypeScript and tests were green in the last verified local pass; rerun after backend/security changes.
- Webapp: TypeScript exits 0. Production build exits 0.
- `gameHandlers.ts` has been deleted; its logic lives in `backend/src/socket/handlers/` (submitAnswer, usePowerup, reconnect, playerReady).
- Android `parseRankings` fixed: display names are now preserved from the current player list across `round:result` transitions.
- Android `CountdownRing` animation is fixed and should remain verified in Android QA/build checks.
- Auth/API rate limiting is wired in `backend/src/app.ts` via the general API limiter and auth-specific limiter.
- `smoke:phase2` PASSED on 2026-04-26: 10 rounds, finale, `game:over`, XP writes, scoring all verified.
  Run: `DATABASE_URL=<railway-postgres> REDIS_URL=redis://localhost:6379 npm run dev:backend` (local Redis via Docker), then `npm run smoke:phase2`.

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

Phase 2 is verified. The next phase is **launch hardening**:

1. **Deploy the primary backend to Railway** - the current Railway deployment (if any) is from the `QuizGame-main` repo; the primary repo (`QuizGame`) needs its own Railway service wired to the same Postgres + Redis.
2. **Run staging smoke against the primary backend** for health, auth, room create/join/start, `/ws`, first-question, and full-loop checks where practical.
3. **Keep power-up REST/web inventory work out of default launch ownership** unless explicitly assigned; mounted socket power-up handling exists, but REST catalog/inventory/equip remains future/unmounted.
4. **Profile / leaderboard / cosmetics** remain unmounted and future scope.
5. **Tune production rate limits from staging evidence**; auth/API limiters are already wired.

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
