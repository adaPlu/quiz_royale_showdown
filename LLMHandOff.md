# Quiz Royale Showdown — LLM Handoff

**Updated:** 2026-08-11 (fourth pass — full audit against verified origin/main baseline)
**Supersedes:** `CODEX_HANDOFF.md` (frozen as a legacy artifact — read it for pre-2026-08-10 history only; do not update it)
**Purpose:** Hand the current audit set and its remediation state to the next LLM session.

> **Read this file first.** It is the authoritative record of what the last audit found, what has
> been fixed, what has not, and what was verified versus merely written. Update it before you run
> out of context — that is its whole job.

---

## 0. Change control — READ BEFORE ACTING

The user instructed on 2026-08-10:

> Do NOT commit, push, open a pull request, merge remote branches, deploy, or modify production
> infrastructure unless I explicitly request it. Local code changes and local test execution ARE
> permitted.

**Status 2026-08-11:** the user authorized committing ("finish committing where needed"). Everything
is now committed on its own branch. **Nothing is pushed** except `fix/friends-room-start-authz`.
Pushing, PRs, and merges still require an explicit request.

Additional standing constraints:

- **Do not weaken or delete legitimate tests to get a green suite.**
- **Do not disable security controls to preserve compatibility.**
- **Prefer the smallest correct fix over a rewrite.** No unrelated refactors.
- **CI blocks direct pushes to `main`.** `release-provenance` in `.github/workflows/ci.yml`
  (commit `3f37e60`, PR #47) fails any `main` SHA not tied to a merged PR. Land work via PR.

---

## 1. Where the code lives

All of these are **git worktrees of one repo** (`origin` = `github.com/adaPlu/quiz_royale_showdown`).
An older revision of `CODEX_HANDOFF.md` wrongly described `QuizGame-main` as a separate repo. It is not.

| Worktree | Branch | State as of 2026-08-11 |
|---|---|---|
| `QuizGame` | `fix/react-router-v7` | primary git root; untouched this session |
| `QuizGame-main` | `main` / `fix/friends-room-start-authz` | this file lives here |
| `QuizGame-webapp` | `frontend` | committed, unpushed |
| `QuizGame-android` | `feature/android` | committed, unpushed |
| `QuizGame-backend` | `feature/backend` | committed, unpushed |

**Deploy surfaces:** Vercel builds a webapp branch — almost certainly `frontend` (the previously
documented `feature/webapp` no longer exists anywhere). **Unverified** — nobody has checked the
Vercel dashboard. If Vercel is still pointed at the deleted branch, production is receiving no
deploys at all. Worth confirming before relying on a `frontend` push to ship anything.

---

## 2. Verification vocabulary

Findings below carry an explicit evidence level. Do not upgrade one without doing the work.

| Level | Means |
|---|---|
| **VERIFIED** | Typecheck + test suite run locally and passed after the change |
| **COMPILED** | Builds, but no test exercises the changed path |
| **WRITTEN** | Code is correct by inspection; never compiled or run |
| **UNPROVEN** | Covered only by mocks that cannot fail if the code is broken |

---

## 3. Audit set — status matrix

Source: a 5-agent parallel audit run 2026-08-10 across the 18 uncommitted files in the
android/backend/webapp worktrees, plus follow-on investigation. IDs are stable — do not renumber.

| ID | Sev | Area | Status | Evidence |
|---|---|---|---|---|
| SEC-01..04 | High | backend authz (friends, room start) | FIXED, pushed | VERIFIED |
| WEB-01 | High | CountdownBar render loop | FIXED, committed | VERIFIED |
| WEB-02 | High | socket rejoin after reconnect | FIXED, committed | VERIFIED |
| WEB-03 | Med | useWebPush null-user state | FIXED, committed | VERIFIED |
| AND-01 | Critical | blank-token crash | FIXED, committed | **WRITTEN** |
| AND-07 | Build | branch unbuildable | PARTIAL, committed | WRITTEN |
| DATA-01 | Critical | 3 tables missing from migrations | FIXED, committed | **WRITTEN** (unapplied) |
| DATA-02 | High | 18 indexes missing from migrations | FIXED, committed | **WRITTEN** (unapplied) |
| LLM-01 | — | OpenAI → Claude migration | DONE, committed | VERIFIED (compile+unit) |
| SEC-05 | High | live API key in `backend/.env` | **RESOLVED 2026-08-15** — key rotated by user | — |
| AND-02 | Med | refresh timeout == OkHttp defaults | FIXED, **uncommitted** | **WRITTEN** |
| AND-03 | High | refresh not single-flight | FIXED, **uncommitted** | **WRITTEN** |
| AND-04..05 | Med–High | WebSocketManager token/state | **NOT FIXED** | — |
| AND-06 | Critical | placeholder cert pin | **BLOCKED** — needs real SHA-256 from user | — |
| DATA-03 | Low | `start.sh` dead migration ref | **NOT A MAIN BUG** — stale branch | see §5 |
| REL-01 | High | leaveRoom concurrent-leave race | FIXED, committed | VERIFIED |
| REL-02 | Med | non-atomic slot claim + claim leak | FIXED, **uncommitted** | VERIFIED |
| REL-03 | **High** (upgraded) | overbooking under READ COMMITTED | FIXED, **uncommitted** | VERIFIED |
| REL-04 | Low | non-atomic start transition | FIXED, **uncommitted** | VERIFIED |
| CI-01 | Med | no migration-drift check | **PARTIAL** — wrong branch | **WRITTEN** (CI-only) |
| TEST-01 | — | `startupOrder.test.ts` red on Windows only | FIXED, committed | VERIFIED |
| TEST-02 | Med | vacuous webapp tests | **NOT FIXED** | — |

---

## 3b. Audit set II — full repository audit against `origin/main` (2026-08-11)

**Baseline: Gate 0 VERIFIED.** Detached worktree at `6e2e03d` = `origin/main` exactly —
0 commits behind, zero divergence, clean tree. This is the code that ships.

> ### Why a second audit set exists — read this before trusting Audit set I
>
> An earlier full audit ran against `fix/react-router-v7`, which was **69 commits and
> ~33,000 lines behind `origin/main`**. Six of its seven findings were **false positives**
> on real `main` — the missing commits were titled "Remediate production audit findings"
> and "production hardening". Those are recorded as FALSE_POSITIVE below.
>
> The audit graph, the parallel fan-out, and the independent verification all worked
> correctly. They were pointed at code nobody runs. Both `/audit` and `/remediate` now
> carry a **Gate 0** that hard-stops on a stale baseline. Run it. Do not skip it.

### FALSE_POSITIVE — stale baseline, verified fixed on `origin/main`

| Claimed | Reality on `main` |
|---|---|
| deploy ungated, red builds ship | `deploy.yml` has `workflow_run` + `conclusion == 'success'` + `needs:` |
| `trust proxy` unset | `app.ts:24` — `app.set("trust proxy", 1)` |
| competing Railway configs | root `railway.toml` no longer exists |
| TIME_FREEZE answer-key window | `submitAnswer.ts:145` deadline has no `timeBoostMs` |
| push/FCM upsert takeover | no `upsert` in `PushNotificationService` |
| unauthenticated invite route | route does not exist |
| **18 indexes / 3 tables missing from migrations** | **schema↔migration drift is CLEAN — 0 in the dangerous direction, all 28 indexes+uniques migrated** |

That last row matters: DATA-01/DATA-02 in Audit set I were also stale-baseline artifacts.

### VERIFIED findings — new IDs in a 10+ block to avoid colliding with Audit set I

| ID | Sev | Area | Evidence |
|---|---|---|---|
| DATA-10 | **High** | expired-guest cleanup permanently bricks startup | CONFIRMED — verified by lead |
| SEC-10 | **High** | access tokens self-renew via `/rooms/join` | CONFIRMED — verified by lead |
| SEC-11 | **High** | refresh replay detected then discarded | CONFIRMED — verified by lead |
| DATA-11 | **High** | duplicate init migrations break `prisma migrate deploy` | CONFIRMED |
| DATA-12 | **High** | `refundWager` double-credits power-up inventory | CONFIRMED |
| DATA-13 | Med-High | Redis authoritative for elimination/winner | CONFIRMED |
| SEC-12 | Med | guest 24h TTL never enforced at auth time | CONFIRMED |
| SEC-13 | Med | socket never re-verifies handshake token | CONFIRMED |
| SEC-14 | Med | `requireAuth` trusts claims, no DB existence check | CONFIRMED |
| DATA-14 | Med | round-answer hash / score zset created with no TTL | CONFIRMED |
| DATA-15 | Med | matchmaking queue unbounded, degrades to never matching | CONFIRMED |
| DATA-16 | Med | run-lease fails **open** without Redis (multi-replica) | CONFIRMED |
| DATA-17 | Med | leaderboard `groupBy` scans all of `XpEvent`; no retention | CONFIRMED |
| SEC-15 | Low | registration leaks account existence | CONFIRMED |
| SEC-16 | Low | JWT secret min length 16, docs say 32 | CONFIRMED |
| DATA-18 | Low | reciprocal duplicate friendships; no self-friendship CHECK | CONFIRMED |
| DATA-19 | Low | dead non-idempotent `awardMatchXp` (0 callers) | CONFIRMED |

### DATA-10 — the one with a live blast radius

`cleanupExpiredGuests.ts` filters eligibility on `guest.roomPlayers.every(status === GAME_OVER)`
and **never checks `Room.hostUserId`**. `Room_hostUserId_fkey` is `ON DELETE RESTRICT`.

Path: guest joins public matchmaking with no room code -> `matchmakeOrCreate` ->
`createRoomEntity` makes the guest `Room.hostUserId`. Game ends; the `Room` row is never
deleted. 24h later the guest expires, passes the filter, and `deleteMany` raises P2003 ->
`process.exitCode = 1` -> `set -eu` aborts `start.sh` -> **`exec node dist/index.js` is
never reached.**

The `Room` row is durable, so **every subsequent deploy fails identically** until someone
edits the database by hand. Armed right now by any guest who has ever hosted a matchmade game.

Fix: exclude users who are `hostUserId` of any surviving room, AND make the cleanup step
non-fatal to boot (move it out of the startup path, or `|| true`).

### SEC-10 / SEC-11 — one workstream, not two (write conflict)

`RoomService.joinRoom` returns `signTokenPair(user).accessToken` as `wsToken` — a full
15-minute credential, indistinguishable from a login token, on a route guarded only by
`requireAuth`. A stolen access token renews itself forever; `/logout` revokes the refresh
row and the attacker is unaffected. `requireAuth` never touches the DB and the minted
tokens are never persisted, so nothing can revoke or even observe them.

`AuthService.rotateRefreshToken` treats `consumeResult.count !== 1` as a plain 401.
`count === 0` **is the signature of a replay** and is discarded — sibling tokens survive.

Both touch `signTokenPair` and its callers. **Serialize them; do not parallelize.**

### Verified CLEAN — checked, not assumed

Match settlement is idempotent (`GameSettlement_roomId_key` inside a Serializable
transaction; P2002 caught and prior rewards returned) — the strongest integrity control in
the codebase. Inventory decrements use predicated `updateMany` consistently. Refresh tokens
stored SHA-256 hashed; rotation is an atomic compare-and-swap. Login performs a dummy
bcrypt hash on the user-missing branch, so timing does not leak account existence. Guests
cannot log in, get no refresh token, and have no escalation path. CSRF header required on
cookie-borne refresh with a non-wildcard CORS allowlist. `start.sh` is fail-closed on
migrations. Redis key-collision safety verified (ULID segments cannot contain `:`).

### Remediation graph — Audit set II

```
DATA-10 ──┐   one-line filter fix; unbreaks deploys; do first
DATA-11 ──┤   all independent, no shared files
DATA-12 ──┤
DATA-13 ──┘
SEC-10 ──── SEC-11        SERIALIZE: both touch signTokenPair's callers
```

### Coverage and limits

Two workstreams ran on the verified baseline: **auth/session** and **data/concurrency**.
Route-authz, socket, infra/CI and client were audited only against the stale branch and are
therefore **UNAUDITED on `origin/main`** — re-run them before claiming full coverage.
No production configuration was inspected; DATA-16's multi-replica impact is
deployment-dependent.

---

## 4. Completed set (detail)

### SEC-01..04 — backend authorization — VERIFIED, pushed, **needs a PR**

Branch `fix/friends-room-start-authz` (commits `64bccc4`, `f37b4fd`), rebased onto `origin/main`,
pushed. **Not merged.** Open the PR:

```bash
gh pr create --base main --head fix/friends-room-start-authz --fill
```

- `routes/friends.ts` — friend-request creation wrapped in `prisma.$transaction` holding a
  `pg_advisory_xact_lock` on the sorted user pair (closes a duplicate-request race).
- `routes/friends.ts` — accept/delete use ownership-scoped `findFirst`, so a non-owner gets 404
  instead of 403 and cannot probe whether a friendship id exists.
- `routes/friends.ts` — BLOCKED friendships rejected from the generic delete route.
- `routes/rooms.ts` — host check moved ahead of `recoverStaleCountdown`, so a rejected start can no
  longer trigger countdown recovery or lease checks as a side effect.

> ⚠️ **The advisory lock is UNPROVEN.** Its tests mock `$queryRaw` and `$transaction` and assert only
> call *ordering*. That proves the lock is taken in the right sequence; it does not prove it
> serializes anything. Exercise against real Postgres before calling the race closed.
>
> ⚠️ **Related:** DATA-01 means the `Friendship` table does not exist in any migrated database. These
> routes are mounted (`app.ts:42`) and would 500 on every request. **SEC-01..04 and DATA-01 must ship
> together** — merging the authz PR alone hardens routes against a table that isn't there.

### WEB-01..03 — webapp — VERIFIED, committed `6a02bc3` on `frontend`, unpushed

`tsc --noEmit` clean; 17 files / 130 tests pass.

- `CountdownBar.tsx` — the animation effect depended on a `Date.now()`-derived value read during
  render, so it re-ran on every parent render. GamePage re-renders on a 500ms interval, so a 20s
  round restarted the animation ~20× instead of once. Clock read moved inside the effect.
- `socketService.ts` — the reconnect handler rejoined only when a `roomCode` was stored, but
  matchmade rooms never set one, so a reconnect silently failed to rejoin and the client stopped
  receiving round events. Falls back to `activeRoomId`.
- `useWebPush.ts` — a null user was written to state as `'unsupported'`, permanently hiding the
  notification settings UI until a page reload.

A `socketService` test covers the matchmade rejoin path and was confirmed to **fail without the fix**.

### LLM-01 — OpenAI → Claude migration — VERIFIED (compile + unit), uncommitted

In `QuizGame-main`. `tsc --noEmit` exit 0; 128/129 tests pass (the 1 failure is TEST-01, pre-existing).

- `config/env.ts` — `ANTHROPIC_API_KEY` / `ANTHROPIC_QUESTION_MODEL`, default `claude-opus-5`
- `package.json` — `openai` removed, `@anthropic-ai/sdk@^0.116.0` added
- `services/QuestionGeneratorService.ts` — `messages.create` + `output_config.format`
- `scripts/generateTargeted.ts` — same; enforced schema replaces the "respond with valid JSON only"
  prompt scaffolding
- `routes/admin.ts`, its test, `generateAIQuestions.ts`, `.env.example`, `docs/PHASED_PLAN.md`

Three non-mechanical changes worth knowing:
1. `max_tokens: 16000` — thinking is on by default on Opus 5 and `max_tokens` caps thinking **plus**
   response text, so the old `max_output_tokens: 12000` would truncate JSON mid-array.
2. Refusal handling — Claude returns HTTP 200 with `stop_reason: "refusal"` and empty `content`.
   Both call sites check it before indexing.
3. `effort: "medium"` — routine generation; low/medium are strong on this model.

**Never exercised against the live API.** The schema and refusal path are compile-verified only.

**Deliberately NOT migrated:** `scripts/seed.ts:163,207` contain trivia questions *about* OpenAI
("Which company developed ChatGPT?" → answer: OpenAI). That is quiz content, not tooling. Changing
it corrupts the question bank and breaks the answers. **Leave it alone.**

---

## 5. Outstanding work

### SEC-05 — live API key — RESOLVED 2026-08-15

**The user rotated the key.** No further action. Retained below for history, plus a
follow-on config gap the rotation surfaced.

> **Open config gap (not SEC-05):** `backend/.env` in `QuizGame-main` still defines only
> `OPENAI_API_KEY`. The LLM-01 migration made the code read `ANTHROPIC_API_KEY`
> (`config/env.ts:63`). The mismatch **fails silently** — `QuestionGeneratorService.isAvailable`
> returns false and generation is skipped with a `logger.warn`, not an error. Add
> `ANTHROPIC_API_KEY=` to `backend/.env` (and to the Railway service variables) or AI question
> generation stays off with no visible failure. `.env.example` already documents the new name.

#### Original finding (historical)

`backend/.env:34` holds a real OpenAI API key in plaintext. It **is** gitignored
(`.gitignore:18`), is untracked, and `git log --all` confirms it was **never committed** — it never
reached GitHub. But it was printed to a session transcript on 2026-08-11.

**Recommend revoking it.** It is dead weight post-migration anyway. `backend/.env` was deliberately
not edited (live secret); the user must add `ANTHROPIC_API_KEY=` themselves. Until then
`QuestionGeneratorService.isAvailable` is false and generation degrades silently.

### DATA-01 / DATA-02 — migration drift — fix WRITTEN, uncommitted, **unapplied**

`QuizGame-backend/backend/prisma/migrations/20260811000000_add_missing_tables_and_indexes/migration.sql`

The init migration never created the `Friendship`, `PushSubscription`, or `FcmToken` tables, the
`FriendshipStatus` enum, or any of the 18 `@@index` declarations — yet all are in `schema.prisma`
and `/api/v1/friends` + `/api/v1/push` are mounted in `app.ts`. `start.sh` runs `prisma migrate
deploy`, which only applies files in `prisma/migrations/` and never reads `schema.prisma`.

**Every request to those routes 500s against a migrated database.**

The migration was hand-written (no shadow DB available) and **validated against Prisma's own
canonical output** via `prisma migrate diff --from-empty --to-schema-datamodel` — all 18 index names,
3 table DDLs, the enum, unique indexes, and FKs match exactly. Every statement uses `IF NOT EXISTS`
so it is safe against a database where some objects were created out of band.

**Still required before trusting it:**
- Apply against a real Postgres (Docker daemon was not running; `docker --version` works,
  `docker ps` fails)
- Confirm `prisma migrate status` reports clean afterward
- Consider `CREATE INDEX CONCURRENTLY` if `QuestionBank` is large (it holds ~4,375 rows per the
  legacy handoff — probably fine as-is)

### AND-01 / AND-07 — android — WRITTEN, uncommitted, **never compiled**

`feature/android` cannot build, for four independent pre-existing reasons:

1. **No gradle wrapper on the branch** — `android/gradlew{,.bat}` are tracked on `main`, absent here.
2. **Compose compiler plugin not applied** — Kotlin 2.0 requires it when `compose = true`; the
   `kotlin-compose` alias is defined in `libs.versions.toml` and never used. *Fixed locally* in both
   `build.gradle.kts` files, mirroring `main`.
3. No `local.properties` / `ANDROID_HOME` — workaround: `ANDROID_HOME="C:\Users\plugu\AppData\Local\Android\Sdk"`
4. **`google-services.json` missing in every worktree**, and not gitignored. This is a Firebase
   credential — **do not fabricate one.**

Because of (4), AND-01's fix has never seen a compiler:

- `WebSocketManager.connect` had `require(accessToken.isNotBlank())`, throwing
  `IllegalArgumentException` on a path with no handler — reached from `LobbyViewModel.init`, i.e. a
  Hilt ViewModel constructor, so it crashes the app on lobby entry. A blank stored token is
  reachable (backend JSON is `isLenient`; `AuthTokens.accessToken` has no blank validation;
  `GameRepository.connectIfAuthenticated` guarded only against null). With **no logout path anywhere
  in the app**, the crash recurs on every launch. Fixed: early `return` in `connect` + blank-aware
  guard upstream so it degrades to "sign in required".

### AND-02..06 — android, NOT FIXED

- **AND-06 (Critical)** — `WebSocketManager:145` still holds `PROD_CERT_FINGERPRINT =
  "sha256/AAAA..."` with a "DO NOT SHIP TO PRODUCTION" comment. In release builds the tripwire throws
  on **first multiplayer join**, not at build time.
- **AND-04 (High)** — access token is frozen into `extraHeaders` at socket construction. Socket.IO
  reuses that options object for every reconnect, and nothing re-reads the token. An expired token
  means infinite failed reconnects (every 16s, forever) with no recovery path.
- **AND-03 (High)** — refresh is serialized by a mutex but **not deduplicated**: the refresh token is
  re-read inside the lock, so N concurrent 401s produce N sequential refresh round-trips.
- **AND-05 (Med)** — `socket`, `latestUrl`, `latestAccessToken` are plain `var`s on a `@Singleton`,
  mutated from the main thread and Socket.IO's EventThread with no `@Volatile` or lock. Racing
  `connect` calls can leak a still-connected socket, delivering every server event twice.
- **AND-02 (Med)** — refresh timeout raised 5s → 10s, exactly equal to OkHttp's default connect and
  read timeouts, making it a coin flip which fires first.

### REL-01..04 — RoomService, NOT FIXED

- ~~**REL-01**~~ **FIXED** on `feature/backend` (`6363d98`) — delete + decision now in one transaction, remaining players re-read after the delete, deleteMany instead of delete (no P2025 500), host succession ordered by seatIndex preferring a non-eliminated player. 27 files / 201 tests pass. Original defect, for context: `leaveRoom` concurrent-leave race. `remaining` is derived from a stale player
  snapshot read before the delete and never re-read, with no transaction. Two players leaving at once
  each compute `remaining.length === 1`, so neither takes the "last player out" branch: the room
  survives as an empty `WAITING` row **still in the matchmaking queue**, with a departed
  `hostUserId` — so future joiners get matched in and nobody can ever start a game. Worth its own
  ticket: wrap delete + room-delete/host-reassign in a transaction and re-read inside it.
- **REL-02 (Med)** — `setnx(slotKey,'1')` followed by a separate `expire()`. A crash between them
  leaves the key with **no TTL, forever** — a genuine permanent lockout. `RedisService.setnx` already
  supports the atomic `SET ... EX ... NX` form; pass the TTL as the third argument.
- **REL-03 (Med)** — the "atomic slot claim" key is **user-scoped**, so two different joiners racing
  for the last seat both succeed. No overbooking (the in-transaction count check catches it), but the
  loser gets a 409 instead of being routed elsewhere — the outcome the reservation existed to prevent.
- **REL-04 (Low)** — `startGame` is read-check-write with no transaction. Contained in practice by a
  Redis SETNX lock in `registerHandlers`, but `startedAt` gets clobbered.

### DATA-03 — NOT a `main` bug; `feature/backend` is stale (reclassified 2026-08-11)

The audit reported `start.sh:4` calling `prisma migrate resolve --applied 20260419165003_init` — a
migration that does not exist — masked by `2>/dev/null || true`.

**That line exists only on `feature/backend`.** `main`'s `start.sh` has already replaced it with
`reconcileLegacyMigrations.js` and a fail-closed verify/repair/deploy chain. The audit agent read
the `QuizGame-backend` worktree, whose `start.sh` predates that work.

So this is a **branch-staleness** finding, not a deploy hazard: `feature/backend` needs to rebase or
merge `main` before it ships anything. Severity dropped Med → Low. **Do not "fix" `main`'s
`start.sh` — it is already correct.** Verify with:

```bash
grep -n "migrate resolve" backend/start.sh
```

### CI-01 — no migration-drift check, NOT FIXED

Neither `ci.yml` nor `deploy.yml` runs any Prisma command. Add `prisma migrate diff --exit-code` so
DATA-01/02-class drift cannot recur silently.

### TEST-01 — FIXED, committed on `fix/shell-script-line-endings` (reclassified 2026-08-11)

**My earlier characterization was wrong** and is corrected here: this was **never a `main` bug and
never failed in CI**. It failed only on a Windows working copy.

`startupOrder.test.ts` probes `start.sh` for `"...verifyKnownMigrationState.js\n"`. Git checks the
file out with native line endings, so a Windows copy has CRLF (measured: 60 CRLF, 0 bare LF) and
every `\n` probe misses on the preceding `\r`. The stored blob is LF, so CI on Linux passed the
whole time.

Fixed two ways: the test now normalizes CRLF before probing, and a new root `.gitattributes` pins
`*.sh` and `gradlew` to `eol=lf`. **The `.gitattributes` half is the one with production value** —
`start.sh` is the Railway entrypoint, and a CRLF copy committed back from a Windows editor yields
`#!/bin/sh\r`, which Linux refuses to exec ("bad interpreter"). CI could never have caught that
regression, because CI checks out on Linux where it cannot reproduce.

Verified: 33 files / 126 tests pass. The intermittent "bad port" rate-limiter failures did not
reproduce this run — they are port contention under the parallel pool, not product bugs.

### TEST-02 — vacuous webapp tests, NOT FIXED

- several webapp tests pass regardless of correctness: five
  `if (!interceptor) return;` early-exit guards in `apiClient.test.ts`; a `/users/me` mock in
  `authStore.test.ts` with no assertion reading it back; CountdownBar clamp assertions using
  `toBeGreaterThanOrEqual(0)` where the correct value is exactly `0`. The `CountdownBar` mock returns
  a fresh `useAnimationControls` object per call, so it **structurally cannot** catch WEB-01.
  **The green webapp suite is weaker evidence than it looks**, and CI now gates on it.

---

## 6. Traps this session hit — don't repeat them

1. **`./android/gradlew.bat` does not exist on `feature/android`.** Piping gradle to `tail` swallowed
   the "No such file" error and returned exit 0 from `tail`, producing a false "compile passed"
   claim. **Capture exit codes without a pipe**, or use `PIPESTATUS`.
2. **`main` is not push-safe.** See §0.
3. **Docker is installed but the daemon is not running** — `docker --version` succeeds while
   `docker ps` fails. Don't assume a scratch Postgres is available.
4. **`prisma migrate diff --from-empty --to-schema-datamodel --script` needs no database** and is the
   cheapest way to validate hand-written migration SQL against Prisma's canonical output.
5. **Agent reports are not ground truth.** Every blocking claim in §3 was independently re-verified
   before being acted on. Do the same.

---

## 7. Suggested next order

Dependency-ordered, not severity-ordered:

1. ~~**TEST-01**~~ — done (`fix/shell-script-line-endings`)
2. **SEC-05** — revoke the exposed key (user action; nothing else blocks on it)
3. **DATA-01/02** — apply the migration against a real Postgres. *Blocks 4.*
4. **SEC-01..04** — open the PR, merged **together with** DATA-01 (see §4 warning)
5. **AND-07 → AND-01** — get the branch building, then compile-verify the crash fix. *AND-07 blocks
   AND-01's verification.*
6. **AND-06** — real certificate pin before any release build
7. **`feature/backend` rebase onto `main`** — resolves DATA-03 and picks up the current start.sh
8. Parallel, independent: **AND-02..05**, **REL-02..04**, **CI-01**, **TEST-02**

### Branches now open (all local, nothing pushed except where noted)

| Branch | Carries | Pushed? |
|---|---|---|
| `fix/friends-room-start-authz` | SEC-01..04 + audit findings in `CODEX_HANDOFF.md` | **yes** — needs a PR |
| `chore/migrate-openai-to-claude` | LLM-01 + this file | no |
| `fix/shell-script-line-endings` | TEST-01 | no |
| `feature/backend` | DATA-01/02 migration + REL-01 | no |
| `feature/android` | AND-01 + AND-07 partial | no |
| `frontend` | WEB-01..03 (`6a02bc3`) | no |

### Local environment trap

`node_modules` is shared across a worktree but **not** across branches. `chore/migrate-openai-to-claude`
removes the `openai` package; every other branch still imports it. After switching away from the
migration branch, `GameOrchestrator.test.ts` fails with `Cannot find package 'openai'`. Fix with
`npm install openai --no-save` (the `--no-save` keeps the manifest untouched). This is environment
drift, **not** a code defect — do not "fix" it in source.

---

## 8. Updating this file

Rewrite §3's matrix and the relevant §4/§5 entry whenever a finding changes state. Keep the IDs
stable. Record the **evidence level**, not just "done" — the single most valuable thing this file
carries is the distinction between *written*, *compiled*, and *actually verified*.
