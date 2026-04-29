# Quiz Royale Showdown — Codex Handoff

**Updated:** 2026-04-29
**Primary repo:** `c:\Users\plugu\AndroidStudioProjects\QuizGame-main`
**Branch:** `main` — HEAD `e009905`
**Status:** Phase 3 + Phase 4 (partial) complete. 112 backend + 15 webapp tests. tsc -b + vite build clean. Production login fixed.

---

## Repo Boundaries

- All code lives in `c:\Users\plugu\AndroidStudioProjects\QuizGame-main` (monorepo).
- Workspaces: `backend/` (Node/Express/Prisma), `webapp/` (React/Vite), `android/` (Kotlin/Compose).
- `main` is the integration branch. Push only after build + tests pass.
- Stale `worktree-agent-*` branches on remote — safe to delete, all their work is already in main.

---

## Current Verified State (2026-04-29)

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

- **Production login confirmed working** — Railway health OK, CORS verified, login returns `{ user, accessToken, refreshToken }` as expected.
- **Root cause of "Cannot read properties of undefined (reading 'accessToken')"**: committed `webapp/dist/` was stale (old bundle accessed `response.data.tokens.accessToken`, new backend returns flat `response.data.accessToken`). Fixed by rebuilding and committing new dist — HEAD `e009905`.
- All pages live: `HomePage`, `LoginPage`, `RegisterPage`, `LobbyPage`, `GamePage`, `ResultsPage`, `ProfilePage`, `LeaderboardPage`, `CosmeticsPage`, `/join/:inviteCode` (JoinPage), `FriendsPage`.
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
| FriendsPage (search, add, accept/decline, remove) | ✅ |
| PWA install prompt + OG tags | ✅ |
| `vercel.json` (SPA rewrites, security headers, asset caching) | ✅ |
| Production deployment (Vercel + Railway) | ✅ Login verified working |
| Android FCM integration | ⏳ Needs Firebase config |
| Android deep links for invites | ⏳ |

---

## Next Assigned Work

### Deployment Note
The committed `webapp/dist/` must be kept up-to-date whenever source changes. Before pushing a source change, ALWAYS:
1. `cd webapp && npm run build`
2. `git add -f webapp/dist/`
3. Include dist changes in the commit

### Remaining Phase 4 / Phase 5
| Item | Notes |
|---|---|
| Android FCM integration | Needs `google-services.json` from Firebase console |
| Android deep links for `/join/:inviteCode` | Configure intent filters in `AndroidManifest.xml` |
| Stripe shop integration | Needs Stripe keys; webhook already scaffolded |
| Android ShopScreen (Play Billing v5) | Deferred until Stripe backend complete |
| Leaderboard Friends tab data | Currently shows empty — needs `GET /friends` cross-ref with `/leaderboard` |

### IMPORTANT: dist commit workflow
The `webapp/dist/` dir is both tracked in git AND listed in `.gitignore`. New files added by Vite builds are gitignored and must be force-added (`git add -f webapp/dist/`). This is intentional so Vercel can serve pre-built assets without needing a build step configured.

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
e009905 build(webapp): rebuild dist with Railway URL fallback and full Phase 4 pages
0e27d7a fix(webapp): auto-detect production host and use Railway URL as fallback
aeda1d4 feat: friends pending endpoint, security hardening, a11y pass, Vercel config
0895b72 feat(webapp): FriendsPage, PWA install prompt, OG tags, friends nav
5e8c8d4 docs: update CODEX_HANDOFF — Phase 3 complete, Phase 4 partial, 112+15 tests
d8248df feat(webapp): season leaderboard tabs, push opt-in, invite share + join page
```
