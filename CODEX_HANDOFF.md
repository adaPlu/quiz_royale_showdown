# Quiz Royale Showdown - Codex Handoff

**Updated:** 2026-04-25  
**Primary repo:** `c:\Users\plugu\AndroidStudioProjects\QuizGame`  
**Status:** Phase 1 recovery verified to first live question. Phase 2 full-game hardening is next.

---

## Repo Boundaries

- Primary app repo: `c:\Users\plugu\AndroidStudioProjects\QuizGame`
- Separate Railway question/data workspace: `c:\Users\plugu\AndroidStudioProjects\QuizGame-main\backend`

Do not mix these scopes. The Railway question audit belongs to `QuizGame-main\backend`, not the primary repo.

## Current Verified State

- Phase 1 smoke reaches `round:question_started`.
- Android CLI build passes:

```powershell
android\gradlew.bat -p android :app:assembleDebug
```

- The primary backend mounted launch surface is limited to:
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

Phase 2: harden the full game loop.

Priority order:
1. Backend: verify `GameOrchestrator` from start through `game:over`, including answer submit, answer lock, round result, elimination, finale, XP/result payloads, and cleanup.
2. Web: complete/verify room -> game -> results against the live backend; guard UI routes that call unmounted backend surfaces.
3. Android: keep CLI build green and verify the same room -> game -> results path after backend socket changes.
4. Lead/smoke: run a multiplayer smoke that proves the game advances beyond first question to final results.

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
