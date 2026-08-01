# Quiz Royale Showdown - Launch Plan

**Last Updated:** 2026-07-29

## Current Status

The repo is in launch hardening, not Phase 0 scaffold recovery. The local core
loop has been verified through Phase 1 and Phase 2 smoke evidence recorded in
`docs/CURRENT_STATE_TO_LAUNCH_PLAN.md`.

## Milestones

### M1: Staging Backend Verified

- [ ] Deploy the primary repo backend to Railway from `backend/`.
- [ ] Confirm `/health` reports Postgres and Redis healthy.
- [ ] Configure Vercel `VITE_API_BASE_URL` and `VITE_WS_BASE_URL` for the intended API origin; production web no longer falls back to Railway or localhost.
- [ ] Run guarded staging Phase 1 smoke.
- [ ] Run guarded staging Phase 2 smoke where practical.
- [ ] Run the Railway question-bank audit separately from the primary repo.

### M2: Android Staging Gameplay

- [ ] Android completes auth, room, game, and results against staging.
- [ ] Reconnect and process-death recovery are acceptable for beta.
- [ ] Android event parsing remains aligned to the canonical `/ws` envelope.

### M3: Launch Meta Systems

- [ ] Profile/users, leaderboard, cosmetics, power-ups, challenges, push, and
  admin are mounted locally; add staging smoke coverage before treating them as
  production launch commitments.
- [ ] Shop, friends, seasons, and payments remain future/unmounted until
  backend routes and smoke coverage are added.
- [ ] Production secrets, rollback notes, monitoring, and data-retention
  settings are documented before public launch.

## Dependency And Build Policy

- CI and Docker use `npm ci`.
- Lockfiles are committed and treated as the source of dependency truth.
- Do not run `npm audit fix` or broad dependency upgrades during remediation
  unless the change is explicitly reviewed and lockfile-safe.

## Active Launch Surface

- `GET /health`
- `/api/v1/auth/*`
- `/api/v1/rooms/*`
- `/api/v1/users/*`
- `/api/v1/leaderboard/*`
- `/api/v1/cosmetics/*`
- `/api/v1/powerups/*`
- `/api/v1/challenges/*`
- `/api/v1/push/*`
- `/api/v1/admin/*`
- Socket.IO `/ws`

Future routes should stay guarded or hidden from launch paths until they are
mounted and verified.
