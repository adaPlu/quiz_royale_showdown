# Quiz Royale Showdown — Codex Handoff Document
**Updated:** 2026-04-25  
**Branch:** `phase1/claude-leftoff-wip`  
**Status:** Phase 1 core gameplay complete. Question DB seeded. Polish done.

---

## Repo Locations
- **Primary (Android + backend + webapp):** `c:/Users/plugu/AndroidStudioProjects/QuizGame`
- **Separate backend scripts repo:** `c:/Users/plugu/AndroidStudioProjects/QuizGame-main/backend`

## Active Branch
`phase1/claude-leftoff-wip` — do NOT push to main without reviewing

---

## What's Done ✅

### Backend (in `QuizGame/backend/`)
- Express + Socket.IO + Prisma + Redis fully wired
- JWT auth (15m access / 7d refresh), bcrypt, Zod validation
- `GameOrchestrator.ts` — drives game FSM, fixed 1-player minimum guard
- `RoomService.ts` — create/join/matchmaking/codes; accepts ULID or room code
- `registerHandlers.ts` — handles stuck COUNTDOWN rooms (auto-reset on re-start)
- `admin.ts` route — `/api/v1/admin/questions/count|generate|refill` (X-Admin-Key header)
- `QuestionGeneratorService.ts` — OpenAI gpt-4o-mini, `response_format: json_object`
- `env.ts` — `OPENAI_API_KEY`, `ADMIN_SECRET` env vars added

### Question Database (Railway PostgreSQL)
- **4,375 questions** total across 30+ categories
- Sources: opentdb.com (3× per category = ~3,000) + OpenAI gpt-4o-mini (~1,400)
- Fragmented GPT subcategories consolidated into parent names (57 rows remapped)
- HTML entities fixed (379 rows updated): `&amp;` → `&`
- Audit script: `npm run audit:questions` (reports dupes, bad indices, by-category counts)
- Scripts: `fetch:opentdb`, `generate:questions`, `generate:targeted`, `consolidate:categories`, `audit:questions`

### Android (in `QuizGame/android/`)
Package: `com.quizroyale.showdown`
- Auth: Login, Register, Splash screens fully wired with Hilt + Retrofit
- Home screen: quick play / create / join by code
- Lobby screen: WS join, player list, ready/start
- Game screen: countdown ring, answer buttons, PowerUpTray, loot-drop banner (animated), sound effects (5 SFX mp3s)
- `GameSoundManager.kt` — MediaPlayer wrapper (correct, wrong, elimination, victory, powerup)
- `GameViewModel.kt` — full MVI: WS events → state, powerup inventory, `isReconnecting` StateFlow
- `WebSocketManager.kt` — OkHttp WS + exponential backoff + `isConnected` StateFlow
- `ResultsScreen.kt` — game-over leaderboard sorted by score, Play Again / Home buttons
- `QuizRoyaleNavHost.kt` — full nav graph: Splash→Login→Register→Home→Lobby→Game→Results
- Reconnect overlay: dark dim + spinner + "Reconnecting…" shown when `isReconnecting = true`

### Webapp (in `QuizGame/webapp/`)
- Login, Register, Home, Lobby, Game, Results, Profile, Leaderboard pages all present
- `socketService.ts` — typed Socket.IO client, `onConnectionChange` subscription
- `useSocketStatus.ts` — hook for live `{ connected, reconnecting }` state
- `ReconnectBanner.tsx` — animated amber top banner when socket disconnects
- `ErrorBoundary.tsx` — React class component wrapping full App, shows reload screen on crash
- `LobbyPage.tsx` — stuck-room auto-recovery (detects error, creates fresh room), "New Room" pill button
- Vercel deployed: production webapp at quiz-royale-showdown.vercel.app

---

## Environment Variables Needed

### Backend (.env)
```
DATABASE_URL=          # Railway public PostgreSQL URL (*.rlwy.net not internal)
REDIS_URL=             # Railway Redis URL
JWT_SECRET=
JWT_REFRESH_SECRET=
OPENAI_API_KEY=        # For AI question generation (gpt-4o-mini)
ADMIN_SECRET=          # For /api/v1/admin routes
PORT=4000
```

### Android (BuildConfig)
Defined in `app/build.gradle.kts`:
- `API_BASE_URL` — REST base (e.g. `https://your-railway-app.up.railway.app/api/v1/`)
- `WS_BASE_URL` — WebSocket base (same host, no path)

### Webapp (.env)
- `VITE_WS_BASE_URL` — WebSocket server URL
- `VITE_API_BASE_URL` — REST API base URL

---

## Key File Locations

| File | Purpose |
|---|---|
| `backend/src/services/GameOrchestrator.ts` | Core game loop FSM |
| `backend/src/services/RoomService.ts` | Room create/join/matchmaking |
| `backend/src/socket/registerHandlers.ts` | Stuck-room reset logic |
| `backend/src/scripts/generateTargeted.ts` | AI question gen for thin categories |
| `backend/src/scripts/auditQuestions.ts` | DB audit (run with --fix to clean dupes) |
| `backend/src/scripts/consolidateCategories.ts` | Merge subcategories into parents |
| `android/ui/game/GameViewModel.kt` | All game state + isReconnecting |
| `android/ui/game/GameScreen.kt` | Game UI + reconnect overlay |
| `android/ui/game/ResultsScreen.kt` | Post-game leaderboard |
| `android/ui/navigation/QuizRoyaleNavHost.kt` | Full nav graph |
| `android/data/socket/WebSocketManager.kt` | WS + isConnected StateFlow |
| `webapp/src/services/socketService.ts` | Typed Socket.IO client |
| `webapp/src/hooks/useSocketStatus.ts` | Connection status hook |
| `webapp/src/components/ReconnectBanner.tsx` | Reconnect indicator |
| `webapp/src/components/ErrorBoundary.tsx` | React crash boundary |

---

## What's Left / Known Issues

### High Priority
1. **Android build** — needs to be opened in Android Studio and built to verify Kotlin compilation (no CI yet)
2. **Webapp deploy to Vercel** — push branch or merge to main to trigger Vercel redeploy
3. **Railway redeploy** — backend changes need manual trigger from railway.app dashboard

### Medium Priority
4. **Profile page** — currently a stub; needs real `/users/me` data from backend
5. **PowerUp inventory** — webapp `GamePage.tsx` uses hardcoded `DEFAULT_SLOTS`; should come from backend `powerup:inventory` event or REST endpoint
6. **Leaderboard page** — currently renders static UI; needs `GET /api/v1/leaderboard` endpoint
7. **Results page winner name** — shows `winner.playerId` (ID) not display name; backend `game:over` should include `displayName`

### Low Priority  
8. **Toast system** — webapp has no toast notifications yet (only Snackbar on Android)
9. **FCM push notifications** — scaffolded but not wired
10. **Stripe / Play Billing** — Phase 3

---

## How to Resume

```bash
# Open existing branch
cd c:/Users/plugu/AndroidStudioProjects/QuizGame
git checkout phase1/claude-leftoff-wip

# Run backend locally (needs .env with Railway DB URL)
cd backend && npm run dev

# Run webapp locally
cd webapp && npm run dev

# DB scripts (use QuizGame-main/backend which has the scripts)
cd c:/Users/plugu/AndroidStudioProjects/QuizGame-main/backend
npm run audit:questions          # check DB health
npm run audit:questions -- --fix # remove exact dupes
npm run generate:targeted        # top up thin categories
```
