# Quiz Royale Showdown - Launch Plan

**Last Updated:** 2026-05-11

## Current Status

The repo is in launch hardening, not Phase 0 scaffold recovery. The local core
loop has been verified through Phase 1 and Phase 2 smoke evidence recorded in
`docs/CURRENT_STATE_TO_LAUNCH_PLAN.md`.

## Milestones

### M1: Staging Backend Verified

- [ ] Deploy the primary repo backend to Railway from `backend/`.
- [ ] Confirm `/health` reports Postgres and Redis healthy.
- [ ] Run guarded staging Phase 1 smoke.
- [ ] Run guarded staging Phase 2 smoke where practical.
- [ ] Run the Railway question-bank audit separately from the primary repo.

### M2: Android Staging Gameplay

- [ ] Android completes auth, room, game, and results against staging.
- [ ] Reconnect and process-death recovery are acceptable for beta.
- [ ] Android event parsing remains aligned to the canonical `/ws` envelope.

### M3: Launch Meta Systems

- [ ] Profile, leaderboard, cosmetics, shop, friends, push, and payments are
  mounted only after backend routes exist and smoke coverage is added.
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
- Socket.IO `/ws`

Future routes should stay guarded or hidden from launch paths until they are
mounted and verified.
