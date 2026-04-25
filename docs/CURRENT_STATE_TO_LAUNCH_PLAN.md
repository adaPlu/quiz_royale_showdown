# Quiz Royale Showdown - Current State to Launch Plan

**Last Updated:** 2026-04-23  
**Owner:** Technical Lead  
**Scope:** Replace the stale scaffold-first roadmap with a recovery-first launch sequence based on the current repo state.

---

## 1. Current State Snapshot

### Backend
- Builds and typechecks successfully.
- Game-engine unit tests pass.
- Runtime integration is incomplete:
  - auth token rotation is not production-safe yet
  - room routes are still a stub / partial contract
  - live Socket.IO entrypoint is using a demo handler path rather than the full game loop path
  - global error handler exists but is not mounted

### Web App
- Builds successfully for production.
- Runtime is not launchable yet:
  - registration payload does not match backend validation
  - refresh flow is not aligned with backend response shape
  - room create/join calls target endpoints the backend does not expose
  - Socket.IO path / event contract is not aligned with the backend
  - no verified end-to-end authenticated game flow exists

### Android App
- Static scaffold exists, but the app is not launch-ready.
- Current blockers:
  - no verified Gradle build in this environment
  - auth API models do not match backend response shape
  - registration flow references repository methods that do not exist
  - current websocket transport is raw OkHttp WebSocket, while backend uses Socket.IO
  - launcher flow is still a starter lobby/game shell, not a complete app flow

### Security / Launch Risks
- Refresh tokens are replayable until expiry.
- Backend can fall back to default JWT / infra secrets if production env is misconfigured.
- Android release posture still allows backup and uses cleartext local endpoints.
- Dependency audit still reports transitive high-severity `tar` findings via `@mapbox/node-pre-gyp`.

---

## 2. Launch Principle

The repo is not in "finish polish and ship" shape. It is in "stabilize contracts, recover integration, then ship a narrow vertical slice" shape.

That changes the plan:
- do not treat backend, web, and Android as feature-complete clients
- establish one canonical REST and Socket.IO contract first
- ship a real playable web vertical slice before chasing broad feature scope
- bring Android to parity only after backend and web are stable enough to stop thrashing contracts

---

## 3. Phased Path to Launch

## Phase 1 - Contract Recovery and Launch Foundation
**Goal:** One secure, testable backend contract; one working web vertical slice; Android moved from broken scaffold to buildable parity track.

**Exit criteria:**
- backend auth and refresh are rotation-safe
- backend room endpoints match one canonical contract
- backend Socket.IO path and event names are canonical and documented
- web can register, log in, create/join a room, enter lobby, start a game, answer questions, and see results against the live backend
- Android builds cleanly and completes auth + lobby bootstrap against the same contract

## Phase 2 - Full Web Playable Vertical Slice
**Goal:** Web is fully playable and stable enough to serve as the first launch candidate.

**Exit criteria:**
- 5-player web-only game completes end to end
- reconnects work on web
- scoring, elimination, and game-over are authoritative and consistent
- seed / question bank / rooms / orchestrator all run in a repeatable local and CI setup

## Phase 3 - Android Gameplay Parity
**Goal:** Android matches the live backend contract and can complete the same game loop as web.

**Exit criteria:**
- Android login/register/home/lobby/game/results flow works end to end
- Android uses the same Socket.IO contract as web
- process death / reconnect behavior is acceptable for beta

## Phase 4 - Meta Systems and Payments
**Goal:** Add progression, profile, leaderboard, cosmetics, and commerce only after the core loop is stable.

**Exit criteria:**
- XP, profile, leaderboard, and cosmetics are consistent across backend, web, and Android
- payment verification is server-authoritative
- all inventory-affecting flows are auditable and tested

## Phase 5 - Hardening, Beta, Launch
**Goal:** Load, observability, crash rates, security, rollout, and operations are ready for public launch.

**Exit criteria:**
- security findings reduced to no open critical/high launch blockers
- crash-free / latency / reconnect targets are met
- deployment, rollback, and monitoring are proven in staging

---

## 4. Phase 1 Breakdown

Phase 1 is broken into nine parts so work can run in parallel without overlapping write ownership.

| Part | Owner | Scope | Primary Files | Depends On | Done When |
|---|---|---|---|---|---|
| P1-A | Backend Agent | Canonical auth hardening | `backend/src/routes/auth.ts`, `backend/src/services/AuthService.ts`, `backend/src/config/env.ts`, `backend/prisma/schema.prisma` | none | refresh tokens are persisted / rotated / revoked correctly; insecure default prod behavior removed |
| P1-B | Backend Agent | Rooms API parity | `backend/src/routes/rooms.ts`, `backend/src/services/RoomService.ts`, `backend/src/middleware/auth.ts` | P1-A | create/join/get/start/leave endpoints match one documented contract |
| P1-C | Backend Agent | Socket.IO runtime parity | `backend/src/index.ts`, `backend/src/socket/*`, `backend/src/services/GameOrchestrator.ts` | P1-A | one live socket path, one event naming scheme, one connected handler tree |
| P1-D | Web Agent | Auth and API parity | `webapp/src/pages/LoginPage.tsx`, `webapp/src/pages/RegisterPage.tsx`, `webapp/src/services/apiClient.ts`, `webapp/src/stores/authStore.ts` | P1-A | web auth works against live backend, including refresh behavior |
| P1-E | Web Agent | Home and lobby parity | `webapp/src/pages/HomePage.tsx`, `webapp/src/pages/LobbyPage.tsx`, `webapp/src/App.tsx` | P1-B, P1-D | create/join room flows work from browser against live backend |
| P1-F | Web Agent | Game socket and results parity | `webapp/src/services/socketService.ts`, `webapp/src/hooks/useGameSocket.ts`, `webapp/src/pages/GamePage.tsx`, `webapp/src/pages/ResultsPage.tsx`, `webapp/src/stores/gameStore.ts` | P1-C, P1-E | browser can play a full game and reach results using live socket events |
| P1-G | Android Agent | Android build and auth parity | `android/app/src/main/java/com/quizroyale/showdown/data/auth/*`, `android/app/src/main/java/com/quizroyale/showdown/ui/screens/auth/*`, `android/app/src/main/java/com/quizroyale/showdown/MainActivity.kt` | P1-A | Android builds, authenticates, and lands in a real post-auth home/lobby flow |
| P1-H | Android Agent | Android room / socket parity | `android/app/src/main/java/com/quizroyale/showdown/data/socket/*`, `android/app/src/main/java/com/quizroyale/showdown/ui/lobby/*`, `android/app/src/main/java/com/quizroyale/showdown/ui/game/*`, `android/app/build.gradle.kts` | P1-B, P1-C, P1-G | Android room join and gameplay use the canonical Socket.IO contract |
| P1-I | Technical Lead | Contract docs, integration gate, and verification | `docs/contracts/*`, `docs/AGENTS.md`, CI / smoke-test docs | P1-A through P1-H | docs match the code and the phase gate is executable |

---

## 5. Phase 1 Order of Execution

### Wave 1 - unblockers
- P1-A Canonical auth hardening
- P1-I Contract decision logging and gate ownership

### Wave 2 - shared runtime alignment
- P1-B Rooms API parity
- P1-C Socket.IO runtime parity
- P1-D Web auth and API parity
- P1-G Android build and auth parity

### Wave 3 - client vertical slices
- P1-E Web home and lobby parity
- P1-F Web game socket and results parity
- P1-H Android room and socket parity

### Wave 4 - lead verification
- run backend tests, typecheck, and integration smoke flow
- run web build and live browser flow
- run Android build / emulator smoke test
- freeze the contract before Phase 2 starts

---

## 6. Phase 1 Assignments to Coding Agents

These are the concrete assignments the coding agents should own next.

### Backend Agent Assignment
**Own:** P1-A, P1-B, P1-C

**Execution order:**
1. Harden auth and refresh token storage / rotation.
2. Replace room route stubs with the canonical authenticated room API.
3. Collapse the socket runtime to one authoritative path / handler tree and align event names to the live contract.

**Must not leave Phase 1 with:**
- unsigned or replayable refresh flow
- multiple competing socket entrypoints
- room endpoints that differ from what clients consume

### Web Agent Assignment
**Own:** P1-D, P1-E, P1-F

**Execution order:**
1. Fix auth payloads and refresh handling to match backend.
2. Align home / lobby room flows to the real room API.
3. Align socket connection path and event handling so web completes the live game loop.

**Must not leave Phase 1 with:**
- browser-only mock flow
- stale event names
- a built app that still cannot complete one real game

### Android Agent Assignment
**Own:** P1-G, P1-H

**Execution order:**
1. Make Android buildable and bring auth models / repository / navigation into parity.
2. Replace transport assumptions and align room / gameplay flow to canonical Socket.IO behavior.

**Must not leave Phase 1 with:**
- nonexistent repository methods
- backend response-shape mismatches
- raw websocket assumptions against a Socket.IO backend

### Technical Lead Assignment
**Own:** P1-I

**Execution order:**
1. Freeze the canonical contract.
2. Keep docs and agent scope aligned with the actual repo.
3. Verify each workstream against the same phase gate before merge.

---

## 7. Agent-Level Phase 1 Subparts

These are the detailed subparts inside each agent assignment.

### Backend Agent Subparts
1. `B1 - Auth + API Shell`
Files: `backend/src/app.ts`, `backend/src/routes/auth.ts`, `backend/src/middleware/auth.ts`, `backend/src/middleware/errorHandler.ts`, `backend/src/services/AuthService.ts`
Done when: `register/login/refresh/logout/me` exist, refresh tokens are persisted and revocable, and error responses are contract-shaped JSON.

2. `B2 - Room Lifecycle REST`
Files: `backend/src/routes/rooms.ts`, `backend/src/services/RoomService.ts`
Depends on: `B1`
Done when: create/get/start/leave room endpoints are live, authenticated, and backed by Prisma/Redis instead of stub responses.

3. `B3 - Socket Transport + Contract Unification`
Files: `backend/src/index.ts`, `backend/src/socket/index.ts`, `backend/src/socket/registerHandlers.ts`, `backend/src/socket/middleware.ts`, `backend/src/socket/handlers/*`, `backend/src/types/contracts.ts`
Depends on: `B1`, `B2`
Done when: there is one active socket stack, one event naming scheme, and no dead-path handler tree.

4. `B4 - Core Game Loop + Persistence Flush`
Files: `backend/src/services/GameOrchestrator.ts`, `backend/src/services/RedisService.ts`, `backend/src/game/*`
Depends on: `B2`, `B3`
Done when: a full game completes with authoritative timing, persisted answers, elimination, finale, XP, and season writes.

5. `B5 - Data Readiness + Verification`
Files: `backend/prisma/schema.prisma`, `backend/prisma/migrations/**`, `backend/src/scripts/seed.ts`, `backend/src/scripts/import-otdb.ts`, `backend/src/routes/health.ts`, backend integration tests
Depends on: may start early; final gate depends on `B1-B4`
Done when: migration is committed, question volume is launch-adequate, `/health` checks Redis/Postgres, and integration tests cover auth/rooms/game flow.

### Web Agent Subparts
1. `W1 - Auth and Session Foundation`
Files: `webapp/src/main.tsx`, `webapp/src/App.tsx`, `webapp/src/stores/authStore.ts`, `webapp/src/services/apiClient.ts`, `webapp/src/pages/LoginPage.tsx`, `webapp/src/pages/RegisterPage.tsx`
Done when: login/register/refresh match the backend and hard reloads do not leave the app in a broken half-authenticated state.

2. `W2 - Shared Contract and Socket Sync`
Files: `webapp/src/lib/contracts.ts`, `webapp/src/services/socketService.ts`, `webapp/src/hooks/useGameSocket.ts`, `webapp/src/stores/gameStore.ts`
Depends on: contract freeze from lead + backend
Done when: web socket envelopes and event names match the backend exactly.

3. `W3 - Lobby and Room Entry Flow`
Files: `webapp/src/pages/HomePage.tsx`, `webapp/src/pages/LobbyPage.tsx`, `webapp/src/components/PlayerAvatar.tsx`
Depends on: `W1`, `W2`, backend room endpoints
Done when: create room, join by code, and quick-play land in a real lobby driven by server room state.

4. `W4 - Game Loop and Results UX`
Files: `webapp/src/pages/GamePage.tsx`, `webapp/src/pages/ResultsPage.tsx`, `webapp/src/components/CountdownBar.tsx`, `webapp/src/components/PowerUpTray.tsx`
Depends on: `W2`; integrates with `W3`
Done when: browser can complete a real game loop and render lock/result/elimination/game-over states correctly.

5. `W5 - Launch Hardening / De-scope`
Files: `webapp/src/pages/ProfilePage.tsx`, `webapp/src/pages/LeaderboardPage.tsx`, `webapp/src/stores/profileStore.ts`
Depends on: `W1`
Done when: non-core routes either work against real endpoints or are removed from the launch path.

### Android Agent Subparts
1. `A1 - Build / Auth / App Shell`
Files: `android/gradlew`, `android/gradlew.bat`, `android/gradle/wrapper/*`, `android/app/build.gradle.kts`, `android/app/src/main/java/com/quizroyale/showdown/MainActivity.kt`, `android/app/src/main/java/com/quizroyale/showdown/data/auth/*`, `android/app/src/main/java/com/quizroyale/showdown/ui/screens/auth/*`, new navigation files
Done when: Android has a reproducible local build path and the auth shell compiles and navigates.

2. `A2 - Lobby / Room Entry + Cache`
Files: `android/app/src/main/java/com/quizroyale/showdown/ui/lobby/*`, new home and room files, local cache files, `di/AppModule.kt`
Depends on: `A1`, backend room endpoints
Done when: Android can create/join rooms and restore latest room state after process death.

3. `A3 - Socket.IO Transport + Contracted Game State`
Files: `android/app/build.gradle.kts`, `android/app/src/main/java/com/quizroyale/showdown/data/socket/*`, new WS model files, `ui/game/GameViewModel.kt`, `ui/game/GameUiState.kt`, `ui/game/GameSideEffect.kt`
Depends on: `A1`, backend socket contract freeze
Done when: Android uses Socket.IO semantics and the same event contract as backend/web.

4. `A4 - Game + Results Presentation`
Files: `android/app/src/main/java/com/quizroyale/showdown/ui/game/*`, new results files, navigation updates
Depends on: `A2`, `A3`
Done when: Android renders the live game loop from lobby through results.

---

## 8. Phase 1 Acceptance Gate

Phase 1 is complete only when all of the following are true:
- `npm test` passes for backend
- `npm run typecheck` passes for backend and web
- backend exposes the canonical auth + room + socket contract
- web completes register/login -> home -> room join/create -> lobby -> game -> results against live backend
- Android builds cleanly and completes register/login -> home/lobby bootstrap against live backend
- no open critical security issue remains in auth/session handling
- docs under `docs/contracts/` describe the contract that is actually running

### Status Check - 2026-04-24
- `npm test` passes for backend: yes
- `npm run typecheck` passes for backend and web: yes
- backend exposes the canonical auth + room + socket contract: mostly yes, after integrating `POST /api/v1/rooms/join`; still needs full live-flow smoke verification
- web completes register/login -> home -> room join/create -> lobby -> game -> results against the live backend: not verified
- Android builds cleanly and completes register/login -> home/lobby bootstrap against live backend: not verified; CLI build remains blocked because the repo has no Gradle wrapper and no system `gradle`
- no open critical auth/session issue remains: improved materially, but not signed off by full integration verification
- docs under `docs/contracts/` describe the running contract: closer, but still need final reconciliation after smoke testing

**Decision:** Phase 1 is **not yet complete**. Do not advance to Phase 2 until the end-to-end web flow is proven and Android has a reproducible build path plus verification.

---

## 9. Immediate Risks to Manage During Phase 1

- Backend and client contracts are currently drifting in multiple files; work must converge on one source of truth fast.
- Android is still the furthest from parity; avoid holding the backend contract open indefinitely for Android-specific churn.
- Do not expand scope into cosmetics, power-ups, progression, payments, or polish until the core contract and playable flow are real.
- Security work is not optional prep work; auth hardening is part of the launch-critical path.

---

## 10. Recommended Next Action

Start Phase 1 immediately with:
- Backend Agent on P1-A
- Web Agent on P1-D
- Android Agent on P1-G
- Technical Lead on P1-I

That gives the team one clean dependency chain:
- auth first
- shared room/socket runtime second
- playable client flows third

---

## 11. Phase 2 Pre-Split

Phase 2 starts only after the Phase 1 acceptance gate passes.

### Phase 2 Goal
Ship a stable, fully playable web-first vertical slice with backend support strong enough to run repeatable multiplayer testing, while bringing Android onto the same stable gameplay contract.

### Phase 2 Exit Criteria
- 5-player game completes end to end against the live backend
- reconnect / resync works on the canonical socket contract
- scoring, elimination, finale, and game-over are authoritative and consistent
- question bank, seeding, and room orchestration are repeatable in local and CI environments
- Android is no longer a scaffold branch; it is on the same gameplay contract and can complete the same flow

### Phase 2 Agent Assignments

#### Backend Agent
1. `B6 - Multiplayer Game Orchestrator Hardening`
Files: `backend/src/services/GameOrchestrator.ts`, `backend/src/game/*`, `backend/src/socket/handlers/*`
Done when: full multiplayer loop is stable under repeated runs and reconnects.

2. `B7 - Crash Recovery / Resync`
Files: `backend/src/services/RedisService.ts`, `backend/src/services/GameOrchestrator.ts`, `backend/src/socket/handlers/reconnect.ts`
Done when: reconnect and interrupted-game recovery behavior is deterministic and testable.

3. `B8 - Integration and Load Readiness`
Files: backend integration tests, `load-test/game-simulation.js`, health/ops support files
Done when: backend can be load-tested and game-flow regressions are covered by integration tests.

#### Web Agent
1. `W6 - Full Web Playable Flow`
Files: `webapp/src/pages/LobbyPage.tsx`, `webapp/src/pages/GamePage.tsx`, `webapp/src/pages/ResultsPage.tsx`, `webapp/src/stores/gameStore.ts`
Done when: web completes a full live multiplayer game without dead states or contract mismatches.

2. `W7 - Reconnect / Resync UX`
Files: `webapp/src/services/socketService.ts`, `webapp/src/hooks/useGameSocket.ts`, `webapp/src/App.tsx`
Done when: browser reconnects cleanly into lobby/game state and recovers from transient socket loss.

3. `W8 - Phase 2 Hardening`
Files: core web flow files only
Done when: launch-path bugs are fixed and non-core routes stay out of the critical path.

#### Android Agent
1. `A5 - Android Gameplay Contract Parity`
Files: `android/app/src/main/java/com/quizroyale/showdown/data/socket/*`, `ui/game/*`, `ui/lobby/*`
Done when: Android uses the same live game contract and can remain in sync through the full loop.

2. `A6 - Android Full Flow`
Files: auth/home/lobby/game/results files
Done when: Android completes auth -> room -> game -> results end to end.

3. `A7 - Android Reconnect / Recovery`
Files: socket, cache, and navigation recovery files
Done when: reconnect and process-death recovery are acceptable for beta testing.

#### Technical Lead
1. `L2 - Phase 2 Contract Freeze`
Keep backend, web, and Android on one gameplay contract with no branch-local variants.

2. `L3 - Phase 2 Verification Gate`
Run the multiplayer acceptance checks and reject merges that reintroduce contract drift.

### Phase 2 Recommended Order
1. Backend `B6` and Web `W6`
2. Backend `B7`, Web `W7`, and Android `A5`
3. Android `A6`
4. Backend `B8`, Android `A7`, and lead verification

### Phase 2 Rule
Do not start power-ups, cosmetics, progression, payments, or polish as new scope inside Phase 2 unless they are required to complete the playable multiplayer loop. Phase 2 is still a core-loop stabilization phase, not a content-expansion phase.
