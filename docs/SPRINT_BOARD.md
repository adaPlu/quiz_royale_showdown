# Sprint Board

**Last Updated:** 2026-05-11
**Current Phase:** Launch hardening and staging

## Current Sprint

- [ ] Deploy the primary repo backend to Railway from `backend/`.
- [ ] Confirm `GET /health` reports Postgres and Redis healthy.
- [ ] Run the guarded staging smoke commands in `docs/STAGING_SMOKE.md`.
- [ ] Keep web and Android launch paths aligned to `/api/v1/auth`,
  `/api/v1/rooms`, and Socket.IO `/ws`.
- [ ] Keep future route calls guarded until those routes are mounted and
  smoke-tested.

## Verification Gates

- `npm ci`
- `npm run typecheck`
- `npm run test -w backend`
- `npm run staging:preflight`
- Android `:app:assembleDebug` when Android launch behavior changes

## Backlog

- Staging full-loop smoke and rollback notes.
- Android staging gameplay parity.
- Reconnect/process-death verification.
- Future meta systems: profile, leaderboard, cosmetics, shop, friends, push,
  payments.

Older Phase 0 scaffold checklists were removed from this board because they no
longer describe the current repository state.
