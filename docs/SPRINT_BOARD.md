# Sprint Board

**Last Updated:** 2026-07-29
**Current Phase:** Launch hardening and staging

## Current Sprint

- [ ] Deploy the primary repo backend to Railway from `backend/`.
- [ ] Confirm `GET /health` reports Postgres and Redis healthy.
- [ ] Set production web `VITE_API_BASE_URL` and `VITE_WS_BASE_URL`; the web API
  client no longer has a production Railway fallback.
- [ ] Run the guarded staging smoke commands in `docs/STAGING_SMOKE.md`.
- [ ] Keep web and Android launch paths aligned to `/api/v1/auth`,
  `/api/v1/rooms`, implemented profile/meta routes, and Socket.IO `/ws`.
- [ ] Keep unsmoked implemented route calls non-blocking for the core flow, and
  keep future route calls guarded until those routes are mounted and smoke-tested.

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
- Staging smoke coverage for mounted profile/users, leaderboard, cosmetics,
  power-ups, challenges, push, and admin routes.
- Future meta systems not yet mounted: shop, friends, seasons, payments.

Older Phase 0 scaffold checklists were removed from this board because they no
longer describe the current repository state.
