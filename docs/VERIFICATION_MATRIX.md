# Verification Matrix

Scope: Phase 1 acceptance and Phase 2 GO gates for the primary repo at
`c:\Users\plugu\AndroidStudioProjects\QuizGame`.

Do not use the separate Railway question workspace as evidence that primary-repo
runtime routes exist. Use it only for question-bank audit status.

## Phase 1 Acceptance

Run from the primary repo root unless a command says otherwise.

| Gate | Command | Pass criteria | Notes |
| --- | --- | --- | --- |
| Backend typecheck | `npm run typecheck -w backend` | TypeScript exits 0 | Backend only. |
| Backend tests | `npm test` | Vitest exits 0 | Root script runs backend tests. |
| Web typecheck | `npm run typecheck -w webapp` | TypeScript exits 0 | Web only. |
| Web production build | `npm run build -w webapp` | Vite build exits 0 | Catches route/import/build regressions. |
| Android debug build | `android\gradlew.bat -p android :app:assembleDebug` | Gradle exits 0 and APK assembles | Requires Android SDK/JDK setup. |
| Phase 1 live smoke | `npm run smoke:phase1` | Registers/logs in 2 users, creates room, joins second user, connects `/ws`, starts game, observes `round:countdown_started` and then `round:question_started` or canonical `error` | Requires backend on local defaults, valid Postgres, Redis recommended, active questions for success path. |
| Empty question-bank retry guard | `$env:EXPECT_START_ERROR="1"; npm run smoke:phase1` | Start returns/observes canonical start failure without leaving room stuck | Use only against an intentionally empty or inactive question bank. Clear env var after run. |

Phase 1 is accepted only when the live smoke proves the two-player start path or
records a canonical start error for the intentional empty-question-bank case.
Infrastructure failures such as invalid `DATABASE_URL`, missing Redis, or backend
not listening are blockers, not product verdicts.

## Phase 2 GO Gates

These gates are required before calling Phase 2 ready for broader manual QA.

| Gate | Command | Pass criteria | Notes |
| --- | --- | --- | --- |
| Backend typecheck/tests | `npm run typecheck -w backend; npm test` | Both exit 0 | Re-run after game-loop changes. |
| Web typecheck/build | `npm run typecheck -w webapp; npm run build -w webapp` | Both exit 0 | Confirms web can consume current contracts. |
| Android assembleDebug | `android\gradlew.bat -p android :app:assembleDebug` | Gradle exits 0 | Confirms Android compile integration. |
| Phase 1 smoke regression | `npm run smoke:phase1` | Still reaches first live question or intentional canonical error | Protects room/start/socket contract. |
| Phase 2 smoke | If present: `npm run smoke:phase2` | Proves flow beyond first question through answer lock, round result, elimination/finale as applicable, and `game:over` | No `smoke:phase2` script exists in this repo yet. Record as `N/A - script missing` until added. |
| Railway question audit | `cd c:\Users\plugu\AndroidStudioProjects\QuizGame-main\backend; railway run npm run audit:questions` | Audit exits 0 and reports active question count/category/difficulty health | Requires Railway CLI/project access. If using a local `.env` with Railway DB credentials, run `npm run audit:questions` from the same directory. |

## Result Template

Copy this into release notes, PR notes, or handoff updates.

```text
Date:
Branch:
Backend typecheck:
Backend tests:
Web typecheck:
Web build:
Android assembleDebug:
smoke:phase1:
smoke:phase2:
Railway question audit:
Observed backend event/error:
Blockers:
```

## Phase 2 Verified Run — 2026-04-26

```text
Date: 2026-04-26
Branch: phase1/claude-leftoff-wip
Backend typecheck: PASS (0 errors)
Backend tests: PASS (34/34)
Web typecheck: PASS (0 errors)
Web build: PASS (Vite build + PWA precache)
Android assembleDebug: PASS (BUILD SUCCESSFUL in 30s)
smoke:phase1: PASS (reaches round:question_started)
smoke:phase2: PASS — full loop to game:over
  - 10 rounds served, both players answered each round
  - Scoring: scoreDelta and totalScore updated correctly per round
  - round:finale_started fired after round 10 with both finalists
  - game:over delivered with winner, ranks, scores (3999/1000), xpAwarded (400/100)
  - All 6 checkpoints hit: roomStateSync, countdownStarted, questionStarted,
    answerLocked, roundResult, gameOver
Railway question audit: 4,375 active questions (previously audited)
Observed backend event/error: none — clean run
Blockers: none
Services: backend dev server (tsx watch), Railway Postgres, Docker Redis (localhost:6379)
```

## Local Service Expectations

`smoke:phase1` expects:

- API base: `API_BASE_URL` or default `http://localhost:4000/api/v1`
- Socket base: `WS_BASE_URL` or default `http://localhost:4000`
- Socket.IO path: `/ws`
- Socket transport event: canonical `message` envelope
- Postgres reachable through `DATABASE_URL`
- Redis reachable through `REDIS_URL` for full game-loop fidelity

