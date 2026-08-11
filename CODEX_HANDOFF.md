# Quiz Royale Showdown - Codex Handoff

**Updated:** 2026-08-10
**Primary repo:** `c:\Users\plugu\AndroidStudioProjects\QuizGame`
**Status:** Phase 2 VERIFIED. Full game loop smoke passed end-to-end on 2026-04-26 (10 rounds, finale, game:over, XP writes, both players scored correctly). Backend auth audit remediation landed on `main` on 2026-08-07 (typecheck + 128 tests green).

---

## Repo Boundaries

- Primary app repo: `c:\Users\plugu\AndroidStudioProjects\QuizGame`
- Railway question/data workflows are driven from: `c:\Users\plugu\AndroidStudioProjects\QuizGame-main\backend`

Correction (2026-08-07): `QuizGame-main` is **not** a separate repo. `git worktree list` shows it is a
git worktree of the primary repo, checked out on `main`. Earlier revisions of this doc described it as a
separate workspace, which is wrong and led to confusion about where commits land. Commits made in
`QuizGame-main` go to `main` in the primary repo.

Keep the *scopes* separate even though the repo is shared: the Railway question audit is a data/admin
workflow, not primary-repo application code. Do not cite question-workspace state as evidence that a
primary-repo route exists.

## Current Verified State

- Phase 1 smoke reaches `round:question_started`.
- ~~Android CLI build passes~~ **FALSE as of 2026-08-10 — do not trust this line.** No Android build
  succeeds from a clean checkout in any worktree. `android/app/google-services.json` is absent
  everywhere and is *not* gitignored, so `:app:processDebugGoogleServices` fails. See the Android
  section under "Audit findings" below for the full list of blockers.
- Backend: TypeScript and tests were green in the last verified local pass; rerun after backend/security changes.
- Webapp: TypeScript exits 0. Production build exits 0.
- `gameHandlers.ts` has been deleted; its logic lives in `backend/src/socket/handlers/` (submitAnswer, usePowerup, reconnect, playerReady).
- Android `parseRankings` fixed: display names are now preserved from the current player list across `round:result` transitions.
- Android `CountdownRing` animation is fixed and should remain verified in Android QA/build checks.
- Auth/API rate limiting is wired in `backend/src/app.ts` via the general API limiter and auth-specific limiter.
- Backend auth audit remediation is complete as of 2026-08-07 (verified: `npm run typecheck` exit 0, `npm test` 32 files / 128 tests passing):
  - `routes/friends.ts`: friend-request creation runs inside `prisma.$transaction` with a
    `pg_advisory_xact_lock` keyed on the sorted user pair, closing a duplicate-request race.
  - `routes/friends.ts`: accept and delete now use ownership-scoped `findFirst` instead of
    `findUnique` + a separate ownership check, so a non-owner gets 404 rather than 403 and cannot
    probe whether a friendship id exists.
  - `routes/friends.ts`: BLOCKED friendships are rejected from the generic delete route.
  - `routes/rooms.ts`: `assertHostCanStartRoom` runs *before* `recoverStaleCountdown`, so a non-host
    can no longer trigger countdown recovery or game-run lease checks via a start attempt that is
    ultimately rejected.
  - Note: the advisory lock uses Postgres `pg_advisory_xact_lock` / `hashtextextended`. This is
    Postgres-specific and will not work against another engine.
- `smoke:phase2` PASSED on 2026-04-26: 10 rounds, finale, `game:over`, XP writes, scoring all verified.
  Run: `DATABASE_URL=<railway-postgres> REDIS_URL=redis://localhost:6379 npm run dev:backend` (local Redis via Docker), then `npm run smoke:phase2`.

The primary backend mounted launch surface is limited to:
  - `GET /health`
  - `/api/v1/auth/*`
  - `/api/v1/rooms/*`

Admin, profile/users, leaderboard, cosmetics, power-ups, challenges, and push routes are mounted in the primary backend, but remain outside the core launch smoke path until deployed and verified. Shop, friends, seasons, and payment flows remain future scope unless mounted and smoke-tested.

## Audit findings (2026-08-10)

A parallel audit covered the 18 uncommitted files across the android/backend/webapp worktrees.
Fixed items are committed; everything else is open.

### Branch / CI facts worth knowing before pushing

- **CI blocks direct pushes to `main`.** `release-provenance` in `.github/workflows/ci.yml` (added by
  `3f37e60`, #47) fails any `main` SHA not tied to a merged PR. Land work via PR; a direct push will
  go red.
- **`main` currently ships a failing test.** `backend/src/scripts/startupOrder.test.ts`
  ("expected -1 to be greater than or equal to 0") fails on clean `origin/main`. It arrived with
  `1809089` (#49). Not caused by any local work — needs an owner.
- Two backend rate-limiter tests ("bad port") fail only under the full parallel run and pass in
  isolation. Port contention in the test setup, not product bugs.

### Backend — migrations are drifted (open, no fix committed)

`schema.prisma` declares **18** `@@index(...)`; the migrations directory contains **0**
`CREATE INDEX`. `start.sh` runs `prisma migrate deploy`, which only applies files in
`prisma/migrations/` and never reads `schema.prisma`. **None of these performance indexes exist in
any deployed database.** Drift began at `c7b0964`, which added the indexes to the schema without
generating a migration; the uncommitted `@@index([isActive, createdAt])` repeats that pattern.

- Fix with `prisma migrate dev --create-only`, expecting a ~18-index migration, not a one-liner.
  Review it on its own; consider `CREATE INDEX CONCURRENTLY` if `QuestionBank` is large.
- Add `prisma migrate diff --exit-code` to CI so this cannot recur silently. Neither `ci.yml` nor
  `deploy.yml` runs any Prisma command today.
- **`start.sh:4` references migration `20260419165003_init`, which does not exist** (the real one is
  `20260422211153_init`). It is masked by `2>/dev/null || true`, so the baseline-repair escape hatch
  is silently dead. Fix before the next deploy.
- Separately, `RoomService.leaveRoom` has a concurrent-leave race: two players leaving at once each
  see a stale player list, neither takes the "last player out" branch, and the room survives as an
  empty `WAITING` row still in the matchmaking queue with a departed `hostUserId` — so nobody can
  ever start a game in it. Worth its own ticket.

### Android — unbuildable branch (partially fixed, uncommitted)

`feature/android` cannot build, for four independent pre-existing reasons:

1. **No gradle wrapper on the branch.** `android/gradlew` and `gradlew.bat` are tracked on `main`
   but absent from `feature/android`.
2. **Compose compiler plugin not applied** (Kotlin 2.0 requires it when `compose = true`). The
   `kotlin-compose` alias is even defined in `libs.versions.toml` and never used. *Fixed locally,
   uncommitted*, mirroring `main`'s config in both `build.gradle.kts` files.
3. No `local.properties` / `ANDROID_HOME` (workaround: set the env var).
4. **`google-services.json` missing in every worktree**, and not gitignored.

Because of (4), the crash fix below is **correct by inspection but never compiled**.

- `WebSocketManager.connect` had `require(accessToken.isNotBlank())`, which throws
  `IllegalArgumentException` on a path with no handler — reached from `LobbyViewModel.init`, i.e. a
  Hilt ViewModel constructor, so it crashes the app on lobby entry. A blank stored token is
  reachable: the backend JSON is `isLenient`, `AuthTokens.accessToken` has no blank validation, and
  `GameRepository.connectIfAuthenticated` guarded only against null. With no logout path anywhere in
  the app to clear tokens, the crash recurs on every launch. *Fixed locally, uncommitted*: early
  `return` in `connect`, plus a blank-aware guard upstream so it degrades to "sign in required".
- Still open: `WebSocketManager` freezes the access token into `extraHeaders` at socket construction,
  so reconnects reuse it forever — an expired token means infinite failed reconnects with no
  recovery. And `PROD_CERT_FINGERPRINT` is still the placeholder `sha256/AAAA...` with a
  "DO NOT SHIP TO PRODUCTION" comment; in release builds it throws on first multiplayer join.

### Webapp — fixed and committed on `frontend` (`6a02bc3`)

Suite repaired and gated in CI (`Web tests`); `tsc --noEmit` clean, 17 files / 130 tests pass.
Three real defects fixed: the CountdownBar animation restarting ~20x per round instead of once;
socketService never rejoining matchmade rooms after a reconnect (silent game freeze); and
`useWebPush` writing a null user to state as `'unsupported'`, permanently hiding the notification UI.

**Treat the green webapp suite as weaker evidence than it looks.** Several tests pass regardless of
correctness: five `if (!interceptor) return;` early-exit guards in `apiClient.test.ts`; a
`/users/me` mock in `authStore.test.ts` with no assertion reading it back; CountdownBar clamp
assertions using `toBeGreaterThanOrEqual(0)` where the correct value is exactly `0`. The
`CountdownBar` test mock returns a fresh `useAnimationControls` object per call, so it structurally
cannot catch the render-loop bug that was just fixed. Also unverified: CI uses `npm install` rather
than `npm ci`, and runs no build step, so a `vite build` failure still reaches Vercel green.

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
3. **Keep power-up REST/web inventory work out of default launch ownership** unless explicitly assigned; socket power-up handling and REST inventory are mounted, but staging smoke still needs to cover any beta commitment.
4. **Profile / leaderboard / cosmetics** are mounted/implemented surfaces that still need staging smoke before launch commitment.
5. **Tune production rate limits from staging evidence**; auth/API limiters are already wired.
6. **Verify the friends advisory lock against real Postgres.** The 2026-08-07 remediation is covered
   only by unit tests with a mocked Prisma client — `$queryRaw` and `$transaction` are mocks, so the
   lock's actual behavior under concurrent requests is still unproven. Exercise it against the real
   database before treating the duplicate-request race as closed.
7. **Friends routes remain outside the launch smoke path.** The auth fixes hardened them but did not
   mount or smoke them; see the mounted-surface list above before making any beta commitment.

## Guardrails

- Docs ownership only for this handoff update.
- Do not revert concurrent work by other agents.
- Do not claim shop/friends/seasons/payments are backend-supported in the primary repo unless they are mounted in `backend/src/app.ts`. Mounted admin/profile/leaderboard/cosmetics/power-up/challenge/push routes still need deployment smoke before production commitment.
- Do not use `QuizGame-main\backend` question data as evidence that primary-repo admin routes exist.

## Useful Commands

```powershell
cd c:\Users\plugu\AndroidStudioProjects\QuizGame

# Android debug build — CURRENTLY FAILS, see "Audit findings" (missing google-services.json).
# Also note: no gradle wrapper exists on the feature/android branch; run from a worktree on main.
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
