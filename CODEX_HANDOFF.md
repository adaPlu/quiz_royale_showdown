# Quiz Royale Showdown — Codex Handoff

**Updated:** 2026-04-27
**Primary repo:** `c:\Users\plugu\AndroidStudioProjects\QuizGame-main`
**Branch:** `main` — HEAD `d8248df`
**Status:** Phase 3 + Phase 4 (partial) complete. 112 backend + 15 webapp tests. tsc -b + vite build clean.

---

## Repo Boundaries

- All code lives in `c:\Users\plugu\AndroidStudioProjects\QuizGame-main` (monorepo).
- Workspaces: `backend/` (Node/Express/Prisma), `webapp/` (React/Vite), `android/` (Kotlin/Compose).
- `main` is the integration branch. Push only after build + tests pass.
- Stale `worktree-agent-*` branches on remote — safe to delete, all their work is already in main.

---

## Current Verified State (2026-04-27)

### Backend — 112/112 tests, TypeScript clean

- All 12 routes mounted and rate-limited (added `/api/v1/friends`).
- Full game loop: countdown → questions → answers → eliminations → finale → `game:over` → XP writes → SeasonScore upsert → `game:level_up` emitted per player who crossed a threshold.
- Bot fill: `waitForPlayersOrFillBots` waits 10s then injects `QuizBot` if < 2 humans.
- `powerup:loot_drop` emitted to each finalist after `game:over`.
- **Power-up server enforcement:** all 5 effects applied in game loop (SABOTAGE, DOUBLE_DOWN, TIME_FREEZE, SHIELD, FIFTY_FIFTY).
- `game:level_up` emitted privately per player when `newLevel > prevLevel` after XP insert.
- `GET /leaderboard/season` — top-100 MMR from active season.
- `GET/POST/PUT/DELETE /friends` — full friendship CRUD (request, list, accept, delete).
- `POST /rooms/:id/invite` — host generates 6-char invite code.
- `GET /rooms/join/:inviteCode` — public lookup of WAITING room by code.
- Prisma: `Friendship` model, `inviteCode` on `Room` — migration `20260427000000_friends_invite`.

### Webapp — 15/15 tests, tsc -b clean, vite build clean

- All pages live: `HomePage`, `LoginPage`, `RegisterPage`, `LobbyPage`, `GamePage`, `ResultsPage`, `ProfilePage`, `LeaderboardPage`, `CosmeticsPage`, `/join/:inviteCode` (JoinPage).
- `LeaderboardPage`: Global / Season / Friends tabs — Season tab hits `/leaderboard/season`.
- `ProfilePage`: XP/level display, daily challenges section, push notification opt-in via `useWebPush`.
- `CosmeticsPage`: catalog grid, equip flow.
- `LobbyPage`: invite button → `POST /rooms/:id/invite` → clipboard copy.
- `JoinPage`: public route `/join/:inviteCode` — navigates to lobby or game based on room state.
- `LevelUpToast`: reads `levelUpQueue` from store, shown on `ResultsPage`.
- `useGameSocket`: handles all 13 server events including `game:level_up`, `powerup:effect_private`.
- `gameStore`: `fiftyFiftyEliminated`, `levelUpQueue`, `powerupInventory` all live.

### Android — assembleDebug passes (unchanged this session)

- `WebSocketManager`: exponential backoff, v1 envelope reconnect events.
- `GameViewModel`: handles all WS events, persists `powerupInventory` to Room DB.
- `GameScreen`: animated `CountdownRing`, reconnect banner.

---

## What's Done vs Open

### Phase 2 — Complete
All 5 power-up server effects enforced. FIFTY_FIFTY client mask wired. 

### Phase 3 — Complete (code-complete; user-gated items remain)
| Item | Status |
|---|---|
| `game:level_up` emitted from GameOrchestrator | ✅ |
| `LevelUpToast` on ResultsPage | ✅ |
| `CosmeticsPage` (catalog + equip) | ✅ |
| Daily challenges in ProfilePage | ✅ |
| `/leaderboard/season` endpoint | ✅ |
| Season tab in LeaderboardPage | ✅ |
| Stripe shop webhook | ⏳ User-gated (needs Stripe keys) |
| Android ShopScreen (Play Billing v5) | ⏳ Deferred |

### Phase 4 — Partial
| Item | Status |
|---|---|
| Friends system (request/accept/list/delete) | ✅ |
| Room invite code generation | ✅ |
| `/join/:inviteCode` public route (webapp) | ✅ |
| Invite share button in LobbyPage | ✅ |
| Push notification opt-in in ProfilePage | ✅ |
| FCM token route (backend) | ✅ (already existed) |
| Android FCM integration | ⏳ Needs Firebase config |
| Android deep links for invites | ⏳ |
| Friends list UI in webapp | ⏳ Next agent |
| PWA install prompt / SEO/OG tags | ⏳ Next agent |

---

## Next Assigned Work

### Agent A — Webapp: Friends list UI
1. Create `webapp/src/pages/FriendsPage.tsx`:
   - Fetch `GET /api/v1/friends` — show accepted friends list.
   - Fetch `GET /api/v1/users/search?q=...` with a debounced search input (300ms).
   - "Add Friend" button on each search result calls `POST /api/v1/friends/request`.
   - Pending requests section: fetch all friendships where `status = PENDING` and show Accept/Decline.
   - Accept calls `PUT /api/v1/friends/:id/accept`. Decline calls `DELETE /api/v1/friends/:id`.
2. Add `/friends` route in `App.tsx` (auth-gated).
3. Add nav link to Friends page in the main nav/header component.

### Agent B — Webapp: PWA polish + OG tags
1. In `vite.config.ts` PWA manifest, verify `name`, `short_name`, `icons`, `theme_color` are set.
2. Add `<meta>` OG tags to `index.html`: `og:title`, `og:description`, `og:image`, `og:url`.
3. Add an "Install App" button on `HomePage.tsx` using the `beforeinstallprompt` event pattern (store the prompt in a ref, show button only when prompt is available, call `prompt.prompt()` on click).
4. In `ProfilePage.tsx`, confirm the push opt-in section is visible and functional (already added last session — just verify it renders correctly in the build).

**Acceptance for both:** `npm run typecheck` + `npm run test` (15 pass) + `npm run build` clean.

---

## Test Commands

```sh
# Backend
cd backend && npx vitest run         # 112 tests

# Webapp
cd webapp && npm run test             # 15 tests
cd webapp && npm run build            # tsc -b + vite build

# Android
./gradlew :android:app:assembleDebug
```

---

## Key File Locations

| What | Where |
|---|---|
| Socket handlers | `backend/src/socket/handlers/` |
| Power-up service | `backend/src/services/PowerUpService.ts` |
| Game loop | `backend/src/services/GameOrchestrator.ts` |
| XP service | `backend/src/services/XpService.ts` |
| Friends routes | `backend/src/routes/friends.ts` |
| Rooms routes | `backend/src/routes/rooms.ts` |
| Socket contracts (backend) | `backend/src/types/contracts.ts` |
| Socket contracts (webapp) | `webapp/src/lib/contracts.ts` |
| Game store | `webapp/src/stores/gameStore.ts` |
| Socket hook | `webapp/src/hooks/useGameSocket.ts` |
| Web push hook | `webapp/src/hooks/useWebPush.ts` |
| Pages | `webapp/src/pages/` |
| Android WS manager | `android/app/src/main/java/com/quizroyale/showdown/data/socket/WebSocketManager.kt` |
| Android game VM | `android/app/src/main/java/com/quizroyale/showdown/ui/game/GameViewModel.kt` |
| Prisma schema | `backend/prisma/schema.prisma` |
| Phase plan | `docs/PHASED_PLAN.md` |

---

## Migration Notes

Migrations `20260419165003_init`, `20260422211153_init`, `20260425000000_init` are all full schema dumps — `start.sh` marks all three as `--applied` before `migrate deploy`. Do not delete.

Migration `20260427000000_friends_invite` adds `Friendship` model and `inviteCode` on `Room`.

---

## Recent Commits

```
d8248df feat(webapp): season leaderboard tabs, push opt-in, invite share + join page
5621350 fix(webapp): resolve build errors in pre-existing components + add powerup event schemas
70b6b68 feat(webapp): level-up toast, CosmeticsPage, daily challenges in ProfilePage
05d075f feat(backend): emit game:level_up per player + add GET /leaderboard/season
5e8680c feat: wire FIFTY_FIFTY client delivery + add powerup:effect_private type
bbe1540 docs: update CODEX_HANDOFF — Phase 2 power-up enforcement complete, 94+12 tests
```
