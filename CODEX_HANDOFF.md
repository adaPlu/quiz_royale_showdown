# CODEX Handoff — Quiz Royale Showdown

_Last updated: 2026-05-09 — Iteration 11 sprint: selectQuestion TOCTOU eliminated, friends canonical ordering, logout limiter, push key validation, socketService + profileStore tests created, CountdownBar clamp, ErrorBoundary lobby button, LobbyViewModel fully wired, PlayPowerup dead code removed, ownedPowerups passed to GameScreen, CI checkout hardened_

---

## Repo layout

| Worktree | Branch | Deployed to |
|---|---|---|
| `QuizGame-main` | `main` | Railway (backend, root `/backend`) |
| `QuizGame-webapp` | `frontend` | Vercel (root dir `webapp/`) |
| `QuizGame-android` | `feature/android` | Manual APK / Play Store |
| `QuizGame-backend` | `feature/backend` | (mirror branch — diverged, not deployed) |

All worktrees share the same GitHub remote: `https://github.com/adaPlu/quiz_royale_showdown.git`

---

## What works in production

- Auth: register / login / refresh / logout. Refresh token in HttpOnly cookie (`qrs.rt`). Access token in memory (15 min TTL).
- Lobby: join room by 6-char code, WebSocket connects, player list syncs.
- Host: first player is host; sees "Start when ready" + Start Game button.
- Game loop: countdown → question → answer submit → round result → elimination → finale → game over.
- Difficulty curves: EASY rounds 1–3, MEDIUM 4–7, HARD 8+ with fallback.
- Bots: single-player games fill a bot; bot submits a random answer with random delay per round.
- Distributed lock: Redis `setnx` prevents double-start across Railway instances.
- Power-ups: fifty_fifty, shield, time_boost, reveal_wrong, second_chance.
- Level-up toasts + loot-drop toasts in-game; loot drops persisted to `PlayerPowerUp`.
- Friends leaderboard: `GET /friends/leaderboard` returns self + accepted friends sorted by totalXp.
- Push notifications: subscriptions written to both Redis and `PushSubscription` table; fallback to DB when Redis down.
- Daily challenges: `win_a_game`, `top_3`, `play_3_games` tracked server-side at game-over.
- Scores, XP, season MMR all persisted to Postgres at game-over.
- Request IDs on every response (`x-request-id`).
- Sentry error capture (gated on `SENTRY_DSN` env var).
- Pino structured logging (NDJSON in prod, pino-pretty in dev).

---

## Completed work by phase

### Week 1 — Critical Security (`2a49ddb`)
- Removed hardcoded VAPID key fallbacks
- JWT/admin secrets reject dev values in production (`env.ts`)
- Admin routes: timing-safe compare + 20 req/15 min rate limit
- Deleted client-authoritative `POST /:id/progress` XP endpoint
- Room invite code: `Math.random` → `crypto.randomBytes(3).hex`
- DB indexes: RefreshToken.tokenHash, XpEvent(userId,createdAt), QuestionBank.isActive, User.displayName

### Week 2 — Data Integrity (`882b769` backend, `d2d6e7a` webapp, `afb2c75` android)
- Disconnect handler always emits `room:player_left` before Redis grace key
- Deleted dead `AuthStore.ts`; deleted `POST /powerups/use` 501 stub
- Removed duplicate `apiLimiter` on `/friends`
- Profile endpoint: OR lookup by id or displayName (case-insensitive)
- `joinRoom` wrapped in `prisma.$transaction` (seat-count race fix)
- `GameOrchestrator.runGameOver`: persists `RoomPlayer.score` + upserts `PlayerPowerUp` loot drops
- Webapp: `GamePage` proper Zustand selector, displayNames in round results, 6-char lobby clamp + error display, stable `useGameSocket` dependency array
- Android: HTTP logging `Level.NONE` in release builds

### Week 3 — Features (`9d14442`)
- Bot answer submission: random-delay Redis writes per round
- Distributed game-start lock via Redis `setnx`
- Difficulty curves in `selectQuestion`
- `GET /friends/leaderboard`
- `ClientEvents` union: added `room:start` and `room:leave`
- `RoomService.toLifecycleState`: fixed missing `hostId` in snapshot

### Week 4 — Infrastructure + Tests (`4132a5d` backend, `147c729` webapp)
- Pino logger (wrapper preserves existing `(msg, data)` API)
- `requestIdMiddleware` stamps `x-request-id` on every request
- Sentry init gated on `SENTRY_DSN`
- Hardcoded Railway URLs removed from webapp; env vars only
- 27 new tests: joinRoom transaction, XpService boundaries, admin auth, friends leaderboard, loot drop, invite code entropy

### Month 2 — Security + Persistence (`e1c7cc3` backend, `c408560` webapp)
- **HttpOnly cookies (LR3)**: `qrs.rt` cookie set on login/register, rotated on refresh, cleared on logout. Body fallback for Android. `formatAuthPayload` no longer leaks refresh token.
- **Push subscription persistence (LR6)**: `PushSubscription` Prisma model added (applied via `db push`). Save/remove writes to Redis + DB. `sendToUser` falls back to DB when Redis unavailable.
- **Challenge tracking (LR7)**: `GameOrchestrator.runGameOver` tracks `win_a_game`, `top_3`, `play_3_games` via XP events with duplicate-award guard. Bots excluded.
- Webapp: `withCredentials: true`, refresh interceptor sends empty body, `authStore` and `apiClient` strip all `refreshToken` state.

### FCM Token DB Persistence (`819a406` backend, `e9c25bb` android)
- **schema.prisma**: `FcmToken` model added (`id`, `userId`, `token @unique`, timestamps, `@@index([userId])`); requires `prisma db push` on Railway to apply
- **PushNotificationService.saveFcmToken**: now writes to both Redis (when available) and Postgres; no longer silently drops token when Redis is down
- **Android HomeViewModel**: uploads pending FCM token from SharedPreferences on every home screen load; closes gap where fresh-install first-login token was never uploaded

### Railway Deploy Config + Logger + Sentry (`e392a21` main)
- **railway.toml**: `startCommand = "npx prisma db push && node dist/index.js"` — schema changes applied automatically on every Railway deploy
- **logger.ts**: rewrote to wrap pino (NDJSON prod, pino-pretty dev) — same (msg, data?) API preserved
- **sentry.ts**: `initSentry()` gated on `SENTRY_DSN` env var; errorHandler now calls `Sentry.captureException` on 5xx errors

### Season End Cron (`main` branch)
- **schema.prisma**: `Season.rewardsAwardedAt DateTime?` field added (requires `prisma db push`)
- **SeasonScheduler.ts**: `processExpiredSeasons()` finds seasons where `endsAt < now && rewardsAwardedAt IS NULL`; awards top-3 players 500/300/150 XP via `XpEvent` rows with `reason: "SEASON_END:{seasonId}"`; marks season `rewardsAwardedAt = now`; bot-safe (only affects real season scores)
- **index.ts**: `startSeasonScheduler()` called on boot — runs immediately then every hour

### Question Bank Admin CRUD (`main` branch)
- **GET /api/v1/admin/questions**: paginated list with `page`, `limit`, `active` query params
- **POST /api/v1/admin/questions**: manual create with Zod validation (prompt, options, correctIndex, category, difficulty)
- **PUT /api/v1/admin/questions/:id**: partial update (any subset of question fields)
- **DELETE /api/v1/admin/questions/:id**: soft-delete (`isActive = false`)
- **PATCH /api/v1/admin/questions/:id/activate**: restore soft-deleted question
- All guarded by existing `requireAdminSecret` + `adminLimiter` middleware

### Cross-Platform Bug Fixes (`42fff1f` backend, `bcfa9bd` webapp, `be59635` android)
- **Webapp gameStore**: wired `game:level_up` server event to `applyLevelUp` action (action existed but switch had no case; level-up toasts were never shown)
- **Android ResultsScreen**: was always empty because `ResultsViewModel.setResults()` was never called. Created `ResultsStore` (@Singleton) as handoff channel: GameViewModel writes final standings + XP on `game:over`, ResultsViewModel collects from it on navigation
- **Android ProfileScreen**: wired `onNavigateToCosmetics` callback to a Cosmetics button (callback was accepted but unused)
- **Android ProfileViewModel**: API failure now emits `Error` state instead of silently substituting hardcoded fallback data
- **Android FriendsScreen**: added Pending Requests section + Accept flow; FriendsApi now has `getPendingRequests()` and `acceptFriendRequest()`; FriendsViewModel loads pending on init and moves accepted users to friends list optimistically

### Backend Route Tests — Full Coverage (`42fff1f`)
- **auth.test.ts** (12 tests): register 201/409/400, login 200/401, logout 204, GET /me 401/200
- **rooms.test.ts** (14 tests): create 401/201, join 401/200, GET by code 200/404, invite code 401/404/401(non-host)/200, leave 401/200
- **powerups.test.ts** (3 tests): GET /inventory 401/200/empty

### Rooms Start-Game Tests + Android Cosmetics Refactor (`56931ba` main, `359229c` android)
- **rooms.test.ts** (+3 tests, now 17): POST /:roomId/start — 401 unauthenticated, 200 happy path (verifies recoverStaleCountdown+startGame+assertQuestionBankReady chain), 500 with roomService.resetStartFailure called on assertQuestionBankReady failure; also adds missing `resetStartFailure` mock to roomServiceMock (was incorrectly on gameOrchestratorMock)
- **Android CosmeticsApi.kt**: extracted from private inner type in ViewModel to `data/cosmetics/CosmeticsApi.kt` — consistent with FriendsApi, GameApi architecture
- **Android CosmeticsViewModel**: removed manual `"Bearer $token"` header building; now relies on `TokenRefreshInterceptor` (which already adds auth to all OkHttp requests); added `equipError: String?` to `CosmeticsUiState.Success` + `clearEquipError()`
- **Android CosmeticsScreen**: dismissible red error banner shown in CosmeticsGrid when equip fails (previously silently swallowed)
- **Backend total: 194 tests passing**

### Audit Remediation — Full Sprint (`92d4f85` main, `cde03e6` frontend, `071112a` android)

**Backend (`92d4f85`)**
- **XpService.awardMatchXp**: `xpToNextLevel` result now returns relative XP remaining (was absolute cumulative threshold) — clients now get correct progress-bar value
- **env.ts**: `VAPID_SUBJECT` default changed from hardcoded personal email to `"mailto:admin@example.com"`; documented in `.env.example`
- **rooms.ts**: `GET /rooms/join/:inviteCode` now guarded by `apiLimiter` (was rate-limit-free, brute-forceable)
- **start.sh**: Created missing file (`#!/bin/sh; npx prisma db push --skip-generate; exec node dist/index.js`) — Dockerfile was referencing a nonexistent script
- **schema.prisma**: Added 12 missing indexes (`User.email`, `Room[hostUserId/status/seasonId]`, `RoomPlayer[userId/roomId]`, `Round[roomId]`, `Answer[roundId/userId]`, `Friendship[requesterId]`, `Friendship[addresseeId,status]`); added `onDelete: Cascade` to both `Friendship` relation fields (prevents orphaned rows on user delete)

**Webapp (`cde03e6` frontend branch)**
- **socketService.ts**: Aligned `powerup:loot_drop` schema (`powerupId` → `roomId`) to match `contracts.ts` — was silently mismatched
- **vercel.json**: CSP `connect-src` widened from hardcoded production Railway hostname to `*.railway.app` and `*.quizroyale.gg` wildcards — staging/preview deploys now work
- **ResultsPage.tsx**: Final standings now resolve player display names via `useGameStore.players` lookup map — was showing raw player IDs
- **authStore.ts + App.tsx**: `initAuth()` failure now sets `authError` state; `App.tsx` renders `AuthErrorBanner` so users see "Your session expired" instead of a silent redirect to login

**Android (`071112a` feature/android branch)**
- **TokenRefreshInterceptor.kt**: Stripped 401/`runBlocking` logic — now only adds Bearer header
- **TokenRefreshAuthenticator.kt**: New file; implements OkHttp `Authenticator` for 401 refresh with `X-Auth-Retry` guard to prevent infinite loops (eliminates ANR risk)
- **AppModule.kt**: Wired `TokenRefreshAuthenticator` into API OkHttpClient; added `provideCosmeticsApi` DI binding
- **AndroidManifest.xml**: `allowBackup="true"` → `allowBackup="false"`
- **LeaderboardViewModel.kt**: Null token → early return with empty state instead of sending unauthenticated request
- **CosmeticsViewModel.kt**: Injects `CosmeticsApi` directly (was recreating Retrofit per ViewModel)
- **QuizFcmService.kt**: Notification ID uses `AtomicInteger` (was `currentTimeMillis().toInt()` which overflows)

### Season Cosmetic Grants + QuestionGeneratorService Tests (`b04bb98` main)
- **SeasonScheduler.awardSeasonRewards**: after awarding XP to top-3, now also looks up `Cosmetic` by code (`season:rank_1/2/3`) and upserts `UserCosmetic` rows; skips gracefully with `logger.warn` if cosmetic not seeded in DB
- **SeasonScheduler.test.ts**: +2 new tests (upserts cosmetics for top-3; skips+warns when code not found)
- **QuestionGeneratorService.test.ts**: new file, 6 tests — `isAvailable` flag, `generateAndStore` no-op without API key, `refillIfNeeded` threshold gate, dedup check in `storeQuestion`
- **Backend total: 202 tests passing**

### Webapp Page Tests (`32da594` frontend branch)
- **LeaderboardPage.test.tsx** (5 tests): tabs render, loading state, season entries, friends tab API endpoint, empty-list graceful
- **ResultsPage.test.tsx** (4 tests): no-results fallback, player rows, winner highlight, home navigation
- **LobbyPage.test.tsx** (4 tests): Live Lobby heading, room-code input, < 6 char validation error, valid code triggers socket emit
- **Webapp (frontend branch) total: 31 tests passing**

### Test Suite — Full Green (`a6290db`, `58aca2b`)
- Fixed 31 previously-failing tests across 6 files (admin, challenges, leaderboard, users, GameOrchestrator, submitAnswer)
- Key fixes: `vi.clearAllMocks()` → `vi.resetAllMocks()` for stale queued mocks; status code 401→403; removed deleted `/progress` endpoint tests; added missing prisma mock entries; fixed loser seasonScore upsert assertion to match `$executeRaw` MMR floor; added `toAdd <= 0` guard in `trackChallengeProgress` to prevent 0-amount XP events
- Added 7 SeasonScheduler tests (`backend/src/services/__tests__/SeasonScheduler.test.ts`)
- Added 7 admin CRUD tests (`backend/src/routes/__tests__/admin.test.ts` — `Admin router — question CRUD` describe block)
- Total before cross-platform fixes: 143 tests / 25 files
- **Total after: 172 tests, 27 test files, all passing**

### Push Route + usePowerup Socket + Webapp GameStore Tests (`57e4d59` main)
- **push.test.ts** (9 tests): GET vapid-public-key 200; POST subscribe 401/200/400; DELETE subscribe 401/200; POST fcm-token 401/200/400
- **usePowerup.test.ts** (8 tests): handler registration; ignores non-powerup messages; VALIDATION_ERROR on bad payload; ROOM_MISMATCH guard; broadcasts public effect to room; sends private effect to socket; passes correctAnswerIndex from Redis to PowerUpService; POWERUP_ERROR / INTERNAL_ERROR handling
- **webapp gameStore.test.ts** (5 new tests): applyLevelUp appends + accumulates; dismissLevelUp removes first / no-op; applyGameOver sets phase+winnerId+finalScores
- **Backend total: 191 tests passing**; **Webapp (QuizGame-main) total: 20 tests passing**

### Webapp FriendsPage + Test Infrastructure (`a374e4e`, `7343cb6`, `570f70d` frontend branch)
- **FriendsPage.tsx**: search users (debounced GET /users/search), send friend requests (POST /friends/request), view + accept pending requests (GET /friends/pending + PUT /friends/:id/accept), view + remove friends (GET /friends + DELETE /friends/:id)
- **App.tsx**: lazy-loaded `/friends` route added (auth-gated)
- **HomePage.tsx**: Friends button added alongside Leaderboard button
- **Test infrastructure**: vitest 3.x + jsdom + @testing-library/react + jest-dom; vite.config.ts uses `vitest/config`; setup.ts imports jest-dom matchers; `npm test` script wired up
- **authStore.test.ts** (12 tests): setUser normalization, setTokens side-effects, clearAuth wipe, initAuth refresh success + silent failure
- **FriendsPage.test.tsx** (6 tests): render, empty-state, friends list, pending requests, send-request optimistic, remove-friend optimistic
- **QuizGame-webapp total: 18 tests passing**

### Challenge Tracking + Android Profile/FCM (`b4a8449` backend, `25d55c7` android)
- **GameOrchestrator**: `answer_10` tracks correct answers from `Answer` table; `streak_5` detects max consecutive correct answers per player; `use_powerup` checks `PowerUpUse` table — all challenges now fully tracked at game-over
- **GET /users/me**: enhanced to return `totalXp`, `level`, `xpToNextLevel`, `wins`, `gamesPlayed`, `mmr` alongside user fields
- **Android `UserApi`**: new Retrofit interface for `GET users/me` with `UserMeResponse` model
- **Android `ProfileViewModel`**: replaced hardcoded stubs with real API call; falls back to local auth data on error
- **Android `PushApi`**: new Retrofit interface for `POST push/fcm-token` with `FcmTokenRequest`
- **Android `QuizFcmService`**: uploads FCM token to backend on `onNewToken` if user is already logged in; stores locally as fallback
- **AppModule**: provides `UserApi` and `PushApi` via `@ApiRetrofit`

### Audit Remediation — Security + Correctness (`284c1c2` backend, `e282463` webapp, `21ed3a3` android)
- **RoomService**: `generateRoomCode` now uses `crypto.randomInt` (was `Math.random`)
- **socket/middleware**: DB error in `prisma.user.findUnique` now rejects connection with `AUTH_DB_ERROR` instead of falling back to unverified JWT payload fields
- **requestId middleware**: always generates fresh UUID; no longer trusts caller-supplied `x-request-id` header
- **app.ts**: `express.json({ limit: '64kb' })`; removed duplicate `requireAuth` at `/friends` mount level
- **leaderboard GET /friends**: now filters by accepted friendships (was leaking global top-N by rating)
- **PowerUpService**: checks Prisma inventory BEFORE setting Redis lock (eliminates permanent lock on Prisma failure)
- **AuthService**: deletes expired `RefreshToken` rows after rotation (prevents unbounded accumulation)
- **schema.prisma**: `Friendship.id @db.VarChar(26)`, `SeasonScore @@index([userId])`, `PowerUpUse @@index([userId],[roomId])`
- **submitAnswer**: Answer rows now persisted to Postgres via upsert; `ANSWER_LOCK_TTL_SECONDS` 3600→300
- **GameOrchestrator**: replaced inline `Math.max(10, score/10)` XP formula with `XpService.awardMatchXp` (proper placement + win bonus)
- **GameOrchestrator**: `RoomPlayer.score` persisted BEFORE `game:over` emit
- **GameOrchestrator**: bot players excluded from loot drops
- **GameOrchestrator**: MMR floor via `GREATEST(mmr-10, 0)` raw SQL (was `{ decrement: 10 }` with no floor)
- **socketService**: `LevelUpPayload.playerId` → `userId`; `powerup:loot_drop` schema `roomId` → `powerupId`
- **apiClient**: access token migrated from `localStorage` to in-memory module variable (XSS hardening)
- **authStore**: `initAuth()` action rehydrates session from HttpOnly cookie on app load; `accessToken` removed from persist
- **useGameSocket**: passes 6-char `roomCode` to `room:join` (was passing ULID `roomId`); localStorage fallback removed
- **gameStore.applyGameOver**: clears stale `question`/`result`/`countdownEndsAt`
- **AppNavGraph**: `LaunchedEffect(roomCode)` — removed `state` key that caused repeated `joinRoom` calls
- **HttpOnly cookies (LR3)**: `qrs.rt` cookie set on login/register, rotated on refresh, cleared on logout. Body fallback for Android. `formatAuthPayload` no longer leaks refresh token.
- **Push subscription persistence (LR6)**: `PushSubscription` Prisma model added (applied via `db push`). Save/remove writes to Redis + DB. `sendToUser` falls back to DB when Redis unavailable.
- **Challenge tracking (LR7)**: `GameOrchestrator.runGameOver` tracks `win_a_game`, `top_3`, `play_3_games` via XP events with duplicate-award guard. Bots excluded.
- Webapp: `withCredentials: true`, refresh interceptor sends empty body, `authStore` and `apiClient` strip all `refreshToken` state.

### Iteration 11 Sprint — Critical/High Audit Remediations (`07520b2` main, `64936b3` frontend, `d9190ba` android)

**Backend (`07520b2` main)**
- **GameOrchestrator.ts selectQuestion**: replaced two-query pattern (findFirst + separate update) with `prisma.$transaction` using `$queryRaw FOR UPDATE SKIP LOCKED` — eliminates TOCTOU race where concurrent games could draw the same question; `lastUsedAt` update runs inside same transaction; empty `usedIds` handled safely via conditional `Prisma.sql` fragment
- **friends.ts**: normalize friend-request pair to `(min(userId, targetId), max(userId, targetId))` before create — existing `@@unique([requesterId, addresseeId])` now covers both send directions (B→A race eliminated)
- **auth.ts**: added `logoutLimiter` (10 req/15min window) on `POST /logout` (was only covered by shared `authLimiter` at 20/15min)
- **push.ts**: Zod `SubscribeSchema.keys` now validates `p256dh` (base64url, 87–88 chars) and `auth` (base64url, 22–24 chars) with regex + `refine` length checks

**Webapp (`64936b3` frontend branch)**
- **socketService.test.ts** (new file, 5 tests): idempotent connect, reconnect re-emits `room:join`, silent Zod parse failure, unsubscribe stops handler, disconnect clears `activeRoomCode`
- **profileStore.test.ts** (new file, 4 tests): `updateXp` accumulation from delta (`xp+delta`), double-call cumulative, `setProfile`, reset
- **CountdownBar.tsx**: `initialScale` clamped to `[0, 1]` via `Math.min(1, Math.max(0, remaining / duration))` — prevents bar overflow when `startedAt` is in the future due to server/client clock skew
- **authStore.test.ts**: added assertion that `setTokens` clears `authError` to `null`
- **ErrorBoundary.tsx**: added "Back to Lobby" button (`window.location.replace('/lobby')`) alongside existing "Go Home" for game-page crash recovery

**Android (`d9190ba` feature/android branch)**
- **LobbyScreen.kt**: full rewrite — now collects `LobbyViewModel.uiState` via `hiltViewModel()`; `LaunchedEffect(Unit)` fires `LobbyIntent.JoinRoom(roomCode)` on entry; shows player list (`LazyColumn`), error text, countdown, and host "Start Game" button; navigation driven by `LaunchedEffect(uiState.gameStarted)`; room code TextField removed (code entered on HomeScreen)
- **AppNavGraph.kt**: `LobbyScreen` call updated to `roomCode + onGameStarted` signature; immediate-navigate logic removed
- **GameSideEffect.kt**: removed `PlayPowerup` sealed entry (was emitted but silently discarded via `else → Unit`)
- **GameViewModel.kt**: removed `trySend(GameSideEffect.PlayPowerup)` from `PowerupActivated` handler
- **GameUiState.ActiveQuestion**: added `ownedPowerups: List<OwnedPowerup>` field; `AppNavGraph` now passes it to `GameScreen` — `PowerUpTray` no longer permanently hidden
- **GameScreen.kt**: `CountdownRing` only rendered during `ActiveQuestion` state; replaced with equal-size `Spacer` on other states to prevent layout shift
- **ci.yml**: cross-repo `actions/checkout` now includes `token: ${{ secrets.GITHUB_TOKEN }}` and `ref: ${{ github.head_ref || github.ref_name }}` — fixes silent failures on private repos and fork PRs

### Remaining work (priority order)
| Priority | Area | Issue |
|---|---|---|
| HIGH | Android | `GameViewModelTest.kt` — no unit tests for most complex ViewModel; 5 critical cases: joinRoom sets Lobby+heartbeat, backoff resets on try, handleGameOver→ResultsStore, submitAnswer idempotency, timer countdown |
| HIGH | Android | `ProfileViewModelTest.kt` — no test file |
| MEDIUM | Webapp | Mid-round reconnect: `applyRoomState` sets `question: null`; server must re-send `round:question_started` on `room:join` during `QUESTION_ACTIVE` or client must emit `round:request_state` |
| MEDIUM | Webapp | `useGameSocket.test.ts` — joinedRef single-join guard, reconnect path, navigation side effects uncovered |
| MEDIUM | Android | `_sideEffects` channel: `NavigateToResults` can be delayed behind suspended snackbar; process it in a separate coroutine |
| LOW | Backend | Redis key cleanup when room is deleted via `leaveRoom` |
| LOW | Android | `CountdownBar.test.tsx` — elapsed-time calculation uncovered |

### Iteration 9 Sprint — Critical/High Audit Remediations (`f087638` main, `a3cbbd9` frontend, `0f7d45c` android)

**Backend (`f087638` main)**
- **leaderboard.ts**: `GET /` now requires `requireAuth` — was publicly returning up to 500 users' MMR/displayName unauthenticated
- **GameOrchestrator.ts**: single `winnerSet = new Set(winnerIds)` declaration hoisted before season block (was declared twice — shadow bug)
- **GameOrchestrator.ts loot-drop**: pre-fetch all powerUp records with one `findMany` before loop (was N+1 `findUnique` per finalist)
- **friends.ts**: catch Prisma P2002 on friendship create → `ConflictError` 409 (was falling through to 500)
- **admin.ts**: AI question generation target capped at `Math.min(..., 500)` (was accepting unbounded count)
- **schema.prisma**: removed redundant `@@index([displayName])` on User (covered by `@@unique`); added `PowerUpUse.roundId @relation` to Round with `onDelete: SetNull`

**Webapp (`a3cbbd9` frontend branch)**
- **PowerUpTray.tsx**: `aria-label` (with count/used suffix) + `aria-pressed` on power-up buttons
- **GamePage.tsx**: `aria-pressed={myAnswer === index}` + `aria-disabled={isLocked || eliminated.includes(index)}` on answer buttons
- **LobbyPage.tsx**: "Enter Game" button `disabled={!activeRoomId}` (was always enabled before room join)
- **ResultsPage.tsx**: second CTA now "Play Again" → `/lobby` (was duplicate "Back to Home" → `/home`)
- **useGameSocket.ts**: `joinedRef.current = false` restored in cleanup (allows room B join after room A without page refresh)
- **authStore.ts setTokens**: adds `authError: null` (clears stale "session expired" banner on background token refresh)

**Android (`0f7d45c` feature/android branch)**
- **AndroidManifest.xml**: `VIBRATE` permission declared (haptic calls were `SecurityException` on all API levels without it)
- **GameScreen.kt CountdownRing**: accepts `timerSeconds/timeLimitSeconds`; `animateFloatAsState` drives sweep angle (was hardcoded `216f`)
- **AppNavGraph.kt**: `LaunchedEffect(viewModel)` instead of `LaunchedEffect(Unit)` for side-effect collector
- **LeaderboardViewModel/Screen**: local DTO renamed `LeaderboardEntry` → `LeaderboardUiEntry` (avoids collision with domain model)

### Iteration 8 Sprint — Critical/High Audit Remediations (`2b8728c` main, `1e2a418` frontend, `b7b5b05` android)

**Backend (`2b8728c` main)**
- **PowerUpService.ts SABOTAGE**: Added `prisma.roomPlayer.findUnique` check before writing sabotage Redis key — throws `BadRequestError` if target is not an active member of the room
- **schema.prisma**: PowerUpUse `@relation` to Room + `onDelete: Cascade`; Friendship `requesterId/addresseeId @db.VarChar(26)`; QuestionBank `@@unique([prompt])`; User `@@unique([displayName])`
- **registerHandlers.ts room:leave**: Cross-checks `socket.data.roomId` before `leaveRoom` — emits `ROOM_MISMATCH` if not set or mismatched
- **SeasonScheduler.ts**: Pre-fetch all season cosmetics with single `findMany` before loop (was N+1)
- **users.ts**: `/search` query capped at 50 chars; `/:identifier/profile` capped at 64 chars with trim+validation

**Webapp (`1e2a418` frontend branch)**
- **GamePage.tsx**: `submitAnswerRef` pattern — ref stays current each render, keydown handler calls `submitAnswerRef.current(idx)` (was stale closure causing submissions to drop on reconnect)
- **useWebPush.ts**: `catch (err)` now `console.warn` + `setPushState('denied')` (was empty catch; push failures invisible to user)
- **App.tsx**: Per-route `<ErrorBoundary key="...">` wrapping GamePage, LobbyPage, ResultsPage — render errors no longer wipe entire app
- **LobbyPage.tsx**: Default `roomCode=''` (was `'ROYALE'`); Join button `disabled={roomCode.trim().length !== 6}`
- **useSocketStatus.ts**: Reconnect banner only on `'reconnecting'`, not `'disconnected'` — prevents flash on intentional logout

**Android (`b7b5b05` feature/android branch)**
- **AndroidManifest.xml**: `QuizFcmService android:exported="true"` + `android:permission="com.google.android.c2dm.permission.SEND"` — FCM was silently broken on API 31+ with `exported="false"`
- **AppNavGraph.kt**: `GameSideEffect.HapticFeedback` wired to vibrator (50ms, API-level guarded for S+/O+)
- **GameSoundManager.kt**: Deleted (never instantiated anywhere — pure dead code)
- **GameSideEffect.kt**: Removed `PlayCorrect`, `PlayWrong`, `PlayElimination`, `PlayVictory` sealed entries (none were emitted; `PlayPowerup` retained)
- **LobbyScreen.kt**: Default `roomCode=""` (was `"ROYALE"`); Join button `enabled = roomCode.isNotBlank()`
- **LeaderboardViewModelTest.kt**: Fixed compile error (nulls passed to non-nullable `Int` fields); assertions updated to `"X MMR"` format

### Iteration 7 Sprint — Critical/High Audit Remediations (`4cbf016` main, `f6e8e23` frontend, `bd2ef66` android)

**Backend (`4cbf016` main)**
- **RoomService.startGame**: `prisma.room.update` → `prisma.room.updateMany({ where: { id, status:'WAITING' } })`; throws `ConflictError` if `count===0` — eliminates double-start race condition
- **auth.ts**: dedicated `loginLimiter` (5/15min) on `/login` route; prevents brute-force on targeted accounts
- **usePowerup.ts**: `socket.data.roomId` check changed from optional guard to hard requirement — sockets with no `roomId` can no longer use power-ups in arbitrary rooms
- **challenges.ts GET /daily**: replaced `new Map(progressRows.map(...))` (last-write wins) with accumulator `for...of` loop summing `row.amount` per challenge key
- **XpService.awardMatchXp**: serial `for...of prisma.xpEvent.create` → `Promise.all([...creates])` — N sequential DB round-trips reduced to 1 batch
- **ci.yml**: android job checks out `${{ github.ref }}` instead of hardcoded `feature/android`

**Webapp (`f6e8e23` frontend branch)**
- **profileStore.ts**: `updateXp(newXp, newLevel)` now accumulates delta `s.xp + xpDelta` (was setting `xp = xpAwarded` — showing only delta earned instead of cumulative); also updates `xpToNextLevel`
- **PowerUpActivationFx.tsx**: `setTimeout(onComplete, 1400)` moved into `useRef` + `useEffect` cleanup — was leaking timer and cutting second powerup animation short
- **useGameSocket.ts**: removed `joinedRef.current = false` from cleanup (was resetting flag, causing double `room:join` on every reconnect)
- **ProfilePage.tsx**: `isOwnProfile` now compares against `currentUser.username` not `currentUser.displayName` (was exposing cosmetics/push settings to other users with same display name)
- **LootDropToast.tsx**: `key` uses `lootDrop.ts` timestamp (stable, set once in store action); was `Date.now()` per-render, forcing AnimatePresence remount and dropping exit animations
- **gameStore.ts applyRoomState**: spreads `resetRoundInteraction` and clears `question` after syncing fields — reconnect no longer shows stale round data from previous session

**Android (`bd2ef66` feature/android branch)**
- **ResultsScreen.kt**: `DisposableEffect(Unit) { onDispose { viewModel.clearResults() } }` — prevents first-game results being shown at start of second game
- **GameViewModel.kt**: removed raw `val uiState: GameUiState get() = _uiState.value` (non-reactive); `uiStateFlow` renamed to `uiState: StateFlow<GameUiState>`; `AppNavGraph.kt` updated
- **FriendsViewModel.kt**: all 6 `launch(Dispatchers.IO)` blocks refactored — network calls use `withContext(IO)`, `_uiState.update` runs on Main dispatcher
- **LeaderboardViewModel.kt**: `LeaderboardUiState` now has `val error: String? = null`; catch block sets error message instead of silently showing empty list

### Iteration 6 Sprint — Critical/High Audit Remediations (`102eea0` main, `e05333f` frontend, `047589f` android)

**Backend (`102eea0` main)**
- **GameOrchestrator.ts**: idempotency guard at top of `runGameOver` — reads `room.status`, returns early if already `GAME_OVER`; prevents double XP/MMR/challenge writes on crash+retry
- **submitAnswer.ts**: `answerWritten = true` moved to immediately after `redisService.hset` (before `prisma.answer.upsert`) — Redis treated as authoritative; lock no longer held if DB fails after Redis write
- **auth.ts**: dedicated `registerLimiter` (5 req/hr per IP) on `/auth/register`; separate from shared `authLimiter` (20/15min) that covers login/refresh/logout
- **XpService.ts**: renamed `xpToNextLevel` → `xpThresholdForLevel`; updated all call sites in `users.ts`
- **schema.prisma**: `@@index([userId])` added to `RefreshToken` model
- **ci.yml**: removed wasted first bare `actions/checkout@v4` from android job; added `cache: 'gradle'` to `actions/setup-java@v4`

**Webapp (`e05333f` frontend branch)**
- **vercel.json**: removed `'unsafe-inline'` from `script-src` CSP (Vite produces hashed bundles; inline scripts not needed; was defeating XSS protection)
- **authStore.ts**: `set({ authError: null })` added as first line of `initAuth` body; `/users/me` catch now `console.warn`s with error (was bare catch)
- **CountdownBar.tsx**: separate `useAnimationControls()` instances for solid bar and blur overlay (`blurControls`); both driven in same `useEffect`

**Android (`047589f` feature/android branch)**
- **LeaderboardViewModel.kt**: removed dead null-checks on `mmr`/`totalXp` (now `Int`, not `Int?`); replaced three-branch `when` with direct `"${row.mmr} MMR"` expression
- **WebSocketManager.kt**: `replay = 1` → `replay = 0` — eliminates stale `room:state_sync` from room A being replayed when subscribing after joining room B
- **GameViewModel.kt**: exponential backoff (1s→30s ceiling) in `observeGameEvents` catch loop; `backoffMs` reset to `1_000L` at start of each successful try block

### Iteration 4 Sprint — Critical/High Audit Remediations (`4f5cac9` main, `2171796` frontend, `88ee071` android)

**Backend (`4f5cac9` main)**
- **GameOrchestrator.ts**: first-game losers `seasonScore.upsert` `create.mmr` changed from `Math.max(0,1000-10)=990` to `1000`; `$executeRaw` now applies the single -10, eliminating double-deduction
- **PowerUpService.ts**: `$transaction` wrapped in try/catch; Redis dedup lock deleted in catch before re-throw — was permanently burning power-up on transient DB error
- **users.ts**: `GET /users/me` `xpToNextLevel` now returns `Math.max(0, threshold - totalXp)` (relative remaining); was absolute cumulative threshold
- **schema.prisma**: `@@index([userId, reason])` added to `XpEvent` for challenge-tracking `reason LIKE 'CHALLENGE:...'` queries
- **ci.yml**: Android CI job added (`actions/checkout feature/android` → `actions/setup-java 17` → `gradlew testDebugUnitTest`)

**Webapp (`2171796` frontend branch)**
- **vite.config.ts**: `sourcemap: false` in production (was `true`, exposing full source tree via DevTools)
- **GamePage.tsx**: `remainingSec` state with 500ms `setInterval` from `question.startedAt + timeLimitMs` — timer now counts down correctly instead of showing static total duration
- **authStore.ts**: `clearAuth` includes `authError: null`; `initAuth` fetches `GET /users/me` after successful refresh to rehydrate stale persisted user
- **gameStore.ts**: `resetRoundInteraction` includes `countdownEndsAt: null` so stale end-time doesn't persist into next question
- **CountdownBar.tsx**: accepts `startedAt` prop; computes elapsed time to start animation at correct offset for late-joining players

**Android (`88ee071` feature/android branch)**
- **LeaderboardApi.kt**: replaced `@SerializedName` (Gson) with `@SerialName` + `@Serializable` (kotlinx); all leaderboard fields were silently `null`/`0` at runtime due to serializer mismatch
- **AuthRepository.kt**: `persistTokens` uses `.commit()` (sync) instead of `.apply()` (async); closes race window where concurrent `currentAccessToken()` reads stale token mid-write
- **WebSocketManager.kt**: `_events` `MutableSharedFlow` now `replay=1, extraBufferCapacity=64, DROP_OLDEST`; events during 1s reconnect gap no longer silently dropped
- **QuizFcmService.kt**: `serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)` replaces per-call bare scope; cancelled in `onDestroy`

### Iteration 3 Sprint — Critical/High Audit Remediations (`d6bbac7` main, `31464e1` frontend, `e920d7d` android)

**Backend (`d6bbac7` main)**
- **SeasonScheduler.ts**: atomic `$executeRaw` UPDATE-with-RETURNING claim per season — prevents double-award across multiple Railway instances (no distributed lock existed before)
- **GameOrchestrator.ts**: `$transaction` wraps `seasonScore.upsert` + `$executeRaw` MMR decrement — eliminates concurrent race where two game-over calls could double-decrement MMR
- **GameOrchestrator.ts**: filter `bot:` IDs before `awardMatchXp`, `seasonScore.upsert`, and final-score persistence — bot IDs caused FK violation crash in single-player games
- **GameStateMachine.ts**: added `COUNTDOWN → FINALE` transition — fixes crash when game ends on an even round (rounds 2/4/6/8/10) with ≤2 players remaining
- **submitAnswer.ts**: `finally` block deletes Redis lock key if `answerWritten = false` — player was previously locked out 5 minutes on DB error after Redis setnx succeeded
- **ci.yml**: `npm install` → `npm ci` for lockfile integrity; `timeout-minutes: 10` on both test steps

**Webapp (`31464e1` frontend branch)**
- **useGameSocket.ts**: `navigateRef` pattern — navigate reference updated each render, preventing stale router context in long-lived socket callbacks
- **GamePage.tsx**: `isLockedRef` synced each render — keyboard handler now reads current lock state, blocking double-answer-submission via keyboard
- **apiClient.ts**: refresh failure re-throws as `ApiError` (not raw `AxiosError`); `Promise.race` with 10s timeout prevents infinite `refreshPromise` hang on network drop
- **socketService.ts**: `console.warn` on Zod parse failures and unknown event types — previously swallowed silently, making production debugging impossible
- **gameStore.ts**: `applyCountdown` now stores `startsAt + seconds*1000` as `countdownEndsAt` — was storing start time so all countdown timers were already expired on arrival
- **ResultsPage.test.tsx**: added `players` to mock state; assertions now verify `displayName` values render (not just raw player IDs)

**Android (`e920d7d` feature/android branch)**
- **AppNavGraph.kt**: `it.ifBlank { roomCode }` (was inverted to `roomCode.ifBlank { it }`) — deep-link roomCode was always used regardless of UI-typed code; blank guard pops back stack instead of navigating to empty roomId
- **GameViewModel.kt**: `observeGameEvents()` wrapped in `while(isActive)` loop — events flow now restarts after socket close/reconnect; previously a closed flow permanently stopped all event delivery
- **GameViewModel.kt**: `startHeartbeat()` cancels previous job before launching new one — prevents duplicate heartbeat loops when `handleRoomState` fires rapidly
- **AuthRepository.kt**: `Mutex` + `withLock` around `refreshIfPossible()` — prevents concurrent double-refresh race where both calls consume the single-use refresh token
- **HomeViewModel.kt**: clears FCM pref on successful upload; logs failure to logcat — was silently re-uploading every app launch

### Iteration 2 Sprint — Tests + UX Polish (`f18dc39` main, `38b8f89` frontend, `f676bdf` android)

**Backend (`f18dc39` main)**
- **XpService.test.ts** (+5 tests): `awardMatchXp` — relative `xpToNextLevel` (remaining, not cumulative); rank-1 win bonus; level-up detection; non-negative guard
- **submitAnswer.test.ts** (+1 test): Redis-down path — `setnx` throws → `INTERNAL_ERROR` emitted (not `ALREADY_ANSWERED`), documents actual error-path behavior
- **ci.yml**: Added `Web tests` step (`npm run test -w webapp`) after typecheck — webapp vitest now runs in CI
- **Backend total: 208 tests passing**

**Webapp (`38b8f89` frontend branch)**
- **gameStore.test.ts** (10 new tests): full `applyServerEvent` pipeline from `room:state_sync` through `game:over`; `setMyAnswer` + `resetRoom`
- **GamePage.test.tsx** (4 new tests): uses `vi.hoisted` mutable state so per-test phase overrides work — smoke tests for WAITING, QUESTION_ACTIVE, ROUND_RESULT, level-up toast
- **apiClient.test.ts** (4 new tests): token injection, 401 triggers `/auth/refresh`, retry with new token, clear token on refresh failure
- **PlayerAvatar.tsx**: wrapped in `React.memo` to prevent unnecessary re-renders during game loop
- **vite.config.ts**: `registerType: "autoUpdate"` → `"prompt"` — user-controlled SW updates (was silently auto-replacing)
- **ResultsPage.tsx**: "Play Again" → "Back to Home" (no quick-play route exists; button navigated to `/home` but was labelled incorrectly)
- **Webapp total: 49 tests passing** (31 → 49, +18)

**Android (`f676bdf` feature/android branch)**
- **build.gradle.kts**: Added `testImplementation` for JUnit 4.13.2, MockK 1.13.10, `kotlinx-coroutines-test:1.8.0`, Turbine 1.1.0; `testOptions { unitTests { isReturnDefaultValues = true } }`
- **TokenRefreshAuthenticatorTest.kt** (4 tests): `X-Auth-Retry` prevents infinite loop; null refresh returns null; successful refresh returns new request; retry header set on new request
- **LeaderboardViewModelTest.kt** (3 tests): `StandardTestDispatcher` + Turbine — null token early-return, empty list on API error, populated entries on success
- **ProfileViewModel.kt**: catch block now emits `"Unable to load profile. Please try again."` instead of raw `e.message`
- **Android unit test total: 7 tests** (bootstrap from zero)

---

## Remaining work

### Redis AOF/RDB persistence
- Enable `appendonly yes` on Railway Redis service dashboard.
- No code change needed — pure infra config.

### Prisma migration consolidation
- `prisma migrate dev` fails with `P3006` — `RoomStatus` enum pre-exists in shadow DB.
- All schema changes applied via `prisma db push` (safe for this project's Railway setup).
- To fix: spin up a clean shadow DB and run `prisma migrate resolve --applied` for existing migrations, then squash. Low priority.

### Android WebSocket reconnect coroutines (low priority — no known bugs)
- App uses Socket.IO client (`io.socket:socket.io-client:2.1.1`) with built-in reconnect: `reconnectionAttempts = Int.MAX_VALUE`, `reconnectionDelay = 1s`, `reconnectionDelayMax = 16s` (exponential backoff).
- `GameViewModel.isReconnecting` StateFlow already surfaces mid-reconnect state to UI.
- Migration to explicit `callbackFlow` / coroutine retry loop would improve testability but is not needed for correctness.
- Key files: `WebSocketManager.kt`, `GameRepository.kt`, `GameViewModel.kt`

### Future / nice-to-have
- **Leaderboard improvement**: global `GET /leaderboard` works — no changes needed unless a dedicated season-agnostic top-N view is wanted
- **Season end cosmetic rewards**: ✅ DONE — `awardSeasonRewards` upserts `UserCosmetic` rows for top-3 using codes `season:rank_1/2/3`. Requires cosmetics to be seeded in DB; skips gracefully if not.
- **Webapp (frontend branch) test coverage**: ✅ 49 tests passing — authStore (12), FriendsPage (6), LeaderboardPage (5), ResultsPage (4), LobbyPage (4) + game/api/store tests. No remaining page test gaps.
- **Backend route coverage**: ✅ all 11 route test files present; 208 tests passing. No remaining route gaps.
- **Android test coverage**: ✅ Bootstrap done — 7 tests (TokenRefreshAuthenticator × 4, LeaderboardViewModel × 3). Remaining gaps: `CosmeticsViewModel`, `HomeViewModel`, `GameViewModel`, `AuthRepository`. Need instrumented (Compose UI) tests.
- **CI webapp tests**: ✅ DONE — `npm run test -w webapp` step added with `timeout-minutes: 10`.
- **Android CI/CD**: ✅ DONE — android job added to ci.yml (`actions/checkout feature/android` → `actions/setup-java 17` + `cache:gradle` → `gradlew testDebugUnitTest`).
- **LeaderboardApi serializer mismatch**: ✅ DONE — replaced `@SerializedName` with `@SerialName`+`@Serializable`.
- **XpService rename**: ✅ DONE — `xpToNextLevel` → `xpThresholdForLevel` in all files.
- **GamePage.tsx live timer**: ✅ DONE — 500ms interval counting down from `question.startedAt + timeLimitMs`.
- **authStore.ts stale user**: ✅ DONE — `initAuth` fetches `/users/me` after refresh.
- **vite.config.ts sourcemap**: ✅ DONE — `sourcemap: false` in production.
- **CSP unsafe-inline**: ✅ DONE — removed from `script-src`.
- **schema.prisma RefreshToken index**: ✅ DONE — `@@index([userId])` added.
- **AuthRepository currentAccessToken mutex**: Document that `currentAccessToken()` is intentionally non-suspending read-only; callers needing consistency should go through `refreshIfPossible()` which holds the mutex.
- **LobbyViewModel dead code**: `LobbyScreen.kt` never calls `hiltViewModel<LobbyViewModel>()`; `observeGameEvents()` runs in dead scope — wire up LobbyViewModel to LobbyScreen (pass uiState + onIntent). AppNavGraph needs `val viewModel: LobbyViewModel = hiltViewModel()` + `val state by viewModel.uiState.collectAsState()`; LobbyScreen signature must accept `LobbyUiState` + callbacks. This is the largest remaining structural gap.
- **PowerUpTray accessibility**: buttons use `title` not `aria-label` — add `aria-label={meta.label}` and `aria-pressed={slot.used}` to each power-up button.
- **Answer button accessibility**: missing `aria-pressed`/`aria-disabled` on answer buttons in GamePage.
- **CountdownRing static**: sweep angle hardcoded `216f` — pass `timerSeconds`/`timeLimitSeconds` to `CountdownRing`, use `animateFloatAsState` for live countdown arc.
- **useWebPush test coverage**: zero tests for subscribe/unsubscribe/VAPID flow.
- **socketService test coverage**: zero tests for payload dispatch and Zod validation loop — add `socketService.test.ts`.
- **GameViewModel test coverage**: most complex ViewModel has zero unit tests — add FSM transition tests.
- **Reconnect question re-sync**: after reconnect `room:state_sync` clears question, but if phase=QUESTION_ACTIVE no follow-up request for current question is made — player sees blank prompt.
- **auth.ts dummy hash**: Replace `bcrypt.hash` dummy path with pre-computed `DUMMY_HASH` + `bcrypt.compare` to prevent timing oracle on register (low priority).
- **selectQuestion TOCTOU**: `findFirst` + separate `update` still two queries — two concurrent games can get the same question. Fix: `$transaction` with raw `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1` then update in same tx. Complex — needs raw SQL Prisma query.
- **leaderboard auth gap**: ✅ DONE — `GET /leaderboard` now requires `requireAuth`.
- **LeaderboardRow nullable fields**: `mmr: Int` non-nullable but API may return null for users with no SeasonScore — will crash with SerializationException at runtime.
- **AppNavGraph LaunchedEffect key**: `LaunchedEffect(Unit)` on Channel collector — use `LaunchedEffect(viewModel)` to prevent duplicate subscriptions on re-entry.
- **DB schema migration**: `prisma migrate dev` fails with P3006 shadow DB conflict — always use `prisma db push` for Railway. To fix permanently: spin up clean shadow DB and run `prisma migrate resolve --applied` then squash.
- **XpEvent/Answer archival**: Both tables grow forever. At scale needs a background archival job.
- **Season cosmetic seeding**: `season:rank_1/2/3` `Cosmetic` rows must be seeded in the DB for `SeasonScheduler` cosmetic grants to have any effect.

---

## Known gotchas

- `prisma migrate dev` — always use `prisma db push` for schema changes (shadow DB `RoomStatus` conflict).
- Vercel watches `frontend` branch; root-level `vercel.json` sets `buildCommand: "npm run build -w webapp"` and `outputDirectory: "webapp/dist"`.
- Railway watches `main` branch, root directory `/backend` in dashboard.
- Socket envelope format: `{ type, version: "v1", payload }` — all events wrapped. Android clients may omit `version`; backend treats absence as v1.
- `feature/backend` branch diverged from `main` — do not merge without careful conflict resolution of `RoomService.ts` and `registerHandlers.ts`.
- Cookie `sameSite: 'strict'` + `path: '/api/v1/auth'` — the refresh cookie is only sent to auth routes. Non-auth requests use the Bearer access token only.
- CORS is configured with `credentials: true` and a specific origin (`CORS_ORIGIN` env var). Wildcard `*` will not work with `withCredentials: true`.
- `start.sh` at `backend/start.sh` is the Docker entrypoint; Railway's `railway.toml` `startCommand` overrides it but the file must exist for Docker builds outside Railway.
- Vercel CSP now uses `*.railway.app` / `*.quizroyale.gg` wildcards — staging preview deploys work without modifying `vercel.json`.
- Android `TokenRefreshAuthenticator` uses `X-Auth-Retry` header to prevent infinite 401 retry loops; `TokenRefreshInterceptor` now only adds the Bearer header.
