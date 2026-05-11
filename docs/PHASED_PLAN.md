# Quiz Royale Showdown - Phased Plan

**Last Updated:** 2026-05-11

## Current Focus

The primary repo is past Phase 0 scaffold recovery. Current work is launch
hardening: keep the verified core game loop stable, deploy the primary backend
to staging, and run production-shaped smoke checks.

Verified local gates are tracked in `docs/CURRENT_STATE_TO_LAUNCH_PLAN.md`.
Treat that file and `docs/STAGING_SMOKE.md` as the current launch references.

## Active Launch Surface

- `GET /health`
- `/api/v1/auth/*`
- `/api/v1/rooms/*`
- Socket.IO on `/ws` with the canonical `message` envelope

Profile, leaderboard, cosmetics, shop, friends, push, admin, and payment routes
remain future scope unless they are mounted in `backend/src/app.ts` and covered
by smoke verification.

## Dependency Policy

- Use `npm ci` for CI, Docker builds, and clean local installs.
- Keep `package-lock.json` committed and use the backend-local lockfile for the
  backend Docker build context.
- Do not run `npm audit fix` or broad dependency upgrades during launch
  remediation unless the change is explicitly reviewed.

## Question Generation

AI-assisted question generation uses OpenAI via `OPENAI_API_KEY`. Keep Railway
question-bank audit work separate from primary-repo launch smoke validation.

## Next Milestone

Deploy the primary repo backend to Railway and pass the staging checks in
`docs/STAGING_SMOKE.md`: health, auth, room create/join/start, `/ws`, Phase 1
smoke, and Phase 2 smoke where practical.
