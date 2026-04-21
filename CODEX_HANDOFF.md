# Quiz Royale Showdown — Codex Handoff Document
**Updated:** 2026-04-20  
**Current tag:** `phase-2-complete` (`0d5b0ba` on `main`)  
**Status:** Phase 2 complete — starting Phase 3 (Meta Progression)

---

## Worktree Layout

| Worktree path | Branch | Role |
|---|---|---|
| `C:/Users/plugu/AndroidStudioProjects/QuizGame-main` | `main` | Tech Lead — merge target |
| `C:/Users/plugu/AndroidStudioProjects/QuizGame-backend` | `feature/backend` | Backend Agent |
| `C:/Users/plugu/AndroidStudioProjects/QuizGame-android` | `feature/android` | Android Agent |
| `C:/Users/plugu/AndroidStudioProjects/QuizGame-webapp` | `feature/webapp` | Web Agent |

**CRITICAL — Agent Permissions:** Spawned subagents can ONLY access `C:/Users/plugu/AndroidStudioProjects/QuizGame` (main worktree). They cannot read/write to the other 3 worktree paths. All implementation must be done by the primary (non-spawned) agent inline, or each agent must be run with the correct working directory set to their own worktree.

---

## Tech Stack (do not change)

- **Backend**: Node.js 20 LTS, TypeScript strict, Express 4, Socket.IO 4, Prisma ORM, PostgreSQL 16, Redis 7, ioredis, JWT (15m access / 7d refresh), bcrypt, Zod, Pino
- **Android**: Kotlin, Jetpack Compose BOM 2024.09.00, Hilt 2.51, Retrofit 2.11, OkHttp 4.12, Room 2.6.1, Navigation Compose, Coil, Timber, Google Play Billing v5, Firebase Crashlytics + FCM
- **Web**: Vite 5, React 18, TypeScript strict, Tailwind CSS, Zustand, Socket.IO-client, Framer Motion, Axios, Zod, React Hook Form
- **Infra**: Docker Compose (local), Railway (backend), Vercel (webapp)

## Brand Colors

- Primary: `#6C3EF5` | Gold: `#FFD700` | BG: `#0E0E1A` | Surface: `#1A1A2E`
- Correct: `#22C55E` | Wrong: `#EF4444` | Muted: `#6B7280`

---

## WebSocket Contract

Envelope: `{ type: "event_name", version: "v1", payload: {} }`

**Server → Client** (all live as of Phase 2):
- `room:state_sync`, `room:player_joined`, `room:player_left`
- `round:countdown_started`, `round:question_started`, `round:answer_locked`, `round:result`
- `round:elimination`, `round:finale_started`
- `powerup:activated`, `powerup:effect`, `powerup:loot_drop`
- `game:over`
- `player:level_up` ← **Phase 3** (backend must emit, clients must handle)

**Client → Server**: `room:join`, `round:submit_answer`, `powerup:activate`, `client:heartbeat`

---

## Completed Phases

### Phase 0 — Foundation
- Backend: Express + Prisma + Redis + JWT auth + socket handshake
- Android: Hilt DI + Retrofit + OkHttp WS + Room + auth flow
- Web: Vite + React + Zustand + Axios + Socket.IO-client + auth pages

### Phase 1 — Core Game Loop
- Backend: GameOrchestrator FSM, ScoringEngine, EliminationEngine, QuestionSelector, TimerAuthority, loot drops
- Android: GameViewModel MVI, GameRepository socket parsing, LobbyViewModel, GameScreen
- Web: gameStore (all 10 event handlers), GamePage, LobbyPage, socketService (Zod-validated)

### Phase 2 — Power-Ups + Game Feel (current `main` HEAD)
- Backend: `PowerUpBalancer` (rarity weights, rollLoot, loot drop post-round in GameOrchestrator)
- Android: `PowerUpTray.kt`, `GameSoundManager.kt`, `ShowLootDrop`/audio `GameSideEffect`s
- Web: `PowerUpActivationFx.tsx`, `LootDropToast.tsx`, `useGameAudio.ts` (Web Audio API synth), `lootDrop` in gameStore

---

## Phase 3 — Meta Progression (START HERE)

### Phase 3 Goal
XP awarded at game end → player levels up → cosmetics unlock → equipped cosmetics visible to all players.

### Backend Agent — Phase 3 Tasks

Working dir: `C:/Users/plugu/AndroidStudioProjects/QuizGame-backend/backend`

1. **XP Service** — create `src/services/XpService.ts`:
   ```ts
   // Computes XP from finalStandings, writes XpEvent rows to DB,
   // calls prisma to update user.level if XP threshold crossed,
   // returns { userId, xpAwarded, newLevel, xpToNextLevel }[]
   ```
   Formula (already in `src/game/XPFormula.ts` — import it):
   - Base XP = 100 × (rank bonus) + 10 × streak + 20 × correct answers
   - Level thresholds: level N requires N² × 150 XP total

2. **Emit `player:level_up`** — in `GameOrchestrator.ts` `runGameOver()`:
   After writing final scores, call `XpService.awardXp(finalStandings)`.
   For each player that levelled up, emit to their socket room:
   ```ts
   io.to(playerId).emit("message", {
     type: "player:level_up", version: "v1",
     payload: { playerId, newLevel, xp, xpToNextLevel }
   });
   ```

3. **Leaderboard route** — create `src/routes/leaderboard.ts`:
   - `GET /api/v1/leaderboard?season=current&limit=100` → top 100 by season MMR
   - `GET /api/v1/leaderboard/friends?limit=50` → friends by score (requires auth)
   Register in `src/app.ts`.

4. **Season ladder upsert** — in `GameOrchestrator.runGameOver()`:
   Upsert `SeasonStanding` rows with MMR delta (winner +30, 2nd +20, 3rd +10, rest 0, eliminated -10).

5. **Daily challenges** — create `src/services/DailyChallengeService.ts`:
   - `getChallengesForUser(userId)` → returns today's 3 challenges from DB
   - `recordProgress(userId, challengeId, delta)` → upserts progress, marks complete if met
   Add route `GET /api/v1/challenges/daily` and `POST /api/v1/challenges/:id/progress`.

6. **Cosmetics equip endpoint** — create `src/routes/cosmetics.ts`:
   - `GET /api/v1/cosmetics` → all cosmetics with `isOwned` and `isEquipped` per user
   - `POST /api/v1/cosmetics/:id/equip` → sets `UserCosmetic.isEquipped = true`, unequips others in same slot

7. Commit: `feat(backend): Phase 3 — XP/level-up, leaderboard, cosmetics equip, season ladder`

### Android Agent — Phase 3 Tasks

Working dir: `C:/Users/plugu/AndroidStudioProjects/QuizGame-android`

1. **ProfileScreen.kt** — `ui/screens/profile/ProfileScreen.kt`:
   - Avatar (Coil), display name, level badge, XP ring (Canvas arc), season rank badge
   - Stats grid: games played, win rate, best streak
   - Equipped cosmetics row with tap-to-change

2. **CosmeticsScreen.kt** — `ui/screens/cosmetics/CosmeticsScreen.kt`:
   - Grid of all cosmetics, locked ones greyed with lock icon
   - Tap owned cosmetic → equip via `POST /api/v1/cosmetics/:id/equip`

3. **LeaderboardScreen.kt** — `ui/screens/leaderboard/LeaderboardScreen.kt`:
   - Tabs: Global / Season / Friends using `TabRow`
   - `LazyColumn` rows with rank number, avatar, display name, score/MMR
   - Pull-to-refresh

4. **Handle `player:level_up`** — in `GameRepository.kt`, add parse case:
   ```kotlin
   "player:level_up" -> GameEvent.LevelUp(
       playerId = payload.getString("playerId"),
       newLevel = payload.getInt("newLevel"),
       xp = payload.getInt("xp"),
       xpToNextLevel = payload.getInt("xpToNextLevel")
   )
   ```
   In `GameViewModel.kt`, handle `GameEvent.LevelUp`:
   ```kotlin
   is GameEvent.LevelUp -> _sideEffects.trySend(GameSideEffect.ShowLevelUp(event.newLevel))
   ```
   Add `data class ShowLevelUp(val newLevel: Int) : GameSideEffect()` to `GameSideEffect.kt`.
   Show a `Snackbar` or animated overlay in `GameScreen.kt`.

5. **Update `AppNavGraph.kt`**: Add routes for Profile, Cosmetics, Leaderboard screens.

6. Commit: `feat(android): Phase 3 — ProfileScreen, CosmeticsScreen, LeaderboardScreen, level-up handling`

### Web Agent — Phase 3 Tasks

Working dir: `C:/Users/plugu/AndroidStudioProjects/QuizGame-webapp/webapp`

1. **Connect `LeaderboardPage.tsx`** (`src/pages/LeaderboardPage.tsx` — already exists as stub):
   - Tabs: Global / Season / Friends
   - Fetch `GET /api/v1/leaderboard?season=current&limit=100` via `apiClient`
   - Render rows with rank, avatar, display name, score using `PlayerAvatar` component
   - Loading skeleton + error state

2. **Cosmetics equip in `ProfilePage.tsx`** (`src/pages/ProfilePage.tsx` — exists as stub):
   - Fetch `GET /api/v1/cosmetics` → show grid, owned vs locked
   - `POST /api/v1/cosmetics/:id/equip` on click, optimistic update in `profileStore`
   - Show currently equipped items

3. **Handle `player:level_up` in `useGameSocket.ts`** (`src/hooks/useGameSocket.ts`):
   Add listener for the `player:level_up` WS event:
   ```ts
   socketService.on('player:level_up', (payload) => {
     // Update profileStore: set newLevel, xp, xpToNextLevel
     // Trigger level-up toast/animation
   });
   ```
   The `player:level_up` event is NOT yet in `socketService.ts` `ServerEventSchemas` or `contracts.ts` — add it to both:
   ```ts
   // contracts.ts
   envelope("player:level_up", z.object({
     playerId: z.string(), newLevel: z.number(),
     xp: z.number(), xpToNextLevel: z.number()
   })),
   // socketService.ts ServerEventSchemas
   'player:level_up': z.object({ playerId: z.string(), newLevel: z.number(), xp: z.number(), xpToNextLevel: z.number() }),
   ```

4. **`LevelUpToast.tsx`** — new component at `src/components/LevelUpToast.tsx`:
   - Slides up from bottom with `framer-motion`
   - Shows "Level Up! → Level {N}" with gold star burst animation
   - Auto-dismisses after 3s
   - Wire into `GamePage.tsx` (listen to profileStore for level change)

5. **Update `profileStore.ts`** to add `level`, `xp`, `xpToNextLevel` state and `applyLevelUp(payload)` action.

6. Commit: `feat(webapp): Phase 3 — leaderboard, cosmetics equip, level-up WS handling + LevelUpToast`

---

## Integration Protocol (Tech Lead)

After each Phase 3 agent commits on their feature branch:
```bash
git -C /c/Users/plugu/AndroidStudioProjects/QuizGame-main checkout main
git -C /c/Users/plugu/AndroidStudioProjects/QuizGame-main merge --no-ff feature/backend -m "merge(backend): Phase 3 complete"
git -C /c/Users/plugu/AndroidStudioProjects/QuizGame-main merge --no-ff feature/android -m "merge(android): Phase 3 complete"
git -C /c/Users/plugu/AndroidStudioProjects/QuizGame-main merge --no-ff feature/webapp -m "merge(webapp): Phase 3 complete"
git -C /c/Users/plugu/AndroidStudioProjects/QuizGame-main tag phase-3-complete
```

Phase 3 integration gate:
- [ ] `POST /auth/login` + `GET /api/v1/leaderboard` both return 200
- [ ] `game:over` → `player:level_up` emitted and received by web client
- [ ] Web leaderboard renders real data
- [ ] Android ProfileScreen shows correct level/XP

---

## Key Invariants (never break)

| Invariant | Why |
|---|---|
| WS envelope always `{ type, version: "v1", payload }` | All 3 clients parse this shape |
| Power-up codes UPPERCASE on backend (`FIFTY_FIFTY`) | DB + orchestrator use uppercase |
| Power-up codes lowercase on webapp (`fifty_fifty`) | `PowerUpTray` slot types |
| Android uses `GameSideEffect` pattern (not direct side effects in VM) | MVI contract |
| `socketService.ts` ServerEventSchemas + `contracts.ts` must stay in sync | Both parse the same WS events |
| `src/utils/logger.ts` on backend has explicit `Logger` interface | TS7022 circular inference bug |
| Worktree agents cannot access each other's paths | Permission architecture |

---

## Recent `main` Git Log

```
0d5b0ba merge(webapp): Phase 2 — PowerUpActivationFx, LootDropToast, Web Audio, loot_drop wired
a622bae merge(android): Phase 2 — PowerUpTray, GameSoundManager, LootDrop event, SFX side effects
0878cc2 merge(backend): Phase 2 — PowerUpBalancer rarity/loot, loot drops post-round
19ed25d feat(webapp): Phase 2 — wire PowerUpActivationFx, LootDropToast, audio into GamePage
1085826 feat(android): Phase 2 — PowerUpTray, GameSoundManager, LootDrop event, SFX side effects
382ee42 feat(backend): Phase 2 — PowerUpBalancer rarity/loot, loot drops after rounds
```

---

## Phased Roadmap

| Phase | Theme | Status |
|---|---|---|
| 0 | Foundation | ✅ Complete |
| 1 | Core game loop | ✅ Complete |
| 2 | Power-ups + game feel | ✅ Complete |
| 3 | Meta progression | 🔄 In progress |
| 4 | PWA + feature parity | ⬜ Pending |
| 5 | Polish + soft launch | ⬜ Pending |
| 6 | Public launch | ⬜ Pending |
