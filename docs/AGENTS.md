# Quiz Royale Showdown — Agent Ownership & Integration Protocol

## Agent Roster

### Backend Agent
- **Branch:** `feature/backend`
- **Tech stack:** Node.js 20, TypeScript, Express 4, Socket.IO 4, Prisma, PostgreSQL 16, Redis 7
- **Working directory:** `backend/`

**Primary ownership:**
- All files under `backend/src/`
- `backend/prisma/`
- `backend/package.json`, `backend/tsconfig.json`
- `backend/Dockerfile`
- `.github/workflows/ci.yml` (backend sections)
- `docker-compose.yml` (backend service block)

**Must NOT touch:**
- `webapp/` (except reading the shared contracts)
- `android/` files
- Any Kotlin or Swift code

---

### Android Agent
- **Branch:** `feature/android`
- **Tech stack:** Kotlin, Jetpack Compose BOM 2024.09.00, Hilt 2.51, Retrofit 2.11, Room 2.6.1, OkHttp 4.12
- **Working directory:** `android/`

**Primary ownership:**
- All files under `android/app/src/`
- `android/app/build.gradle.kts`
- `android/build.gradle.kts`, `android/settings.gradle.kts`
- `android/gradle.properties`

**Must NOT touch:**
- `backend/` or `webapp/` source files
- Shared contracts docs (read-only reference)

---

### Web Agent
- **Branch:** `feature/webapp`
- **Tech stack:** Vite 5, React 18, TypeScript, Tailwind CSS, Zustand, Socket.IO-client, Framer Motion, Axios
- **Working directory:** `webapp/`

**Primary ownership:**
- All files under `webapp/src/`
- `webapp/index.html`, `webapp/vite.config.ts`, `webapp/tailwind.config.ts`
- `webapp/package.json`, `webapp/tsconfig*.json`

**Must NOT touch:**
- `backend/` or `android/` source files

---

## Shared Files (Lead Only)

The following files are owned by the Technical Lead and must not be modified by feature agents without a PR review:

- `docs/contracts/api-contract.md`
- `docs/contracts/ws-events.md`
- `docs/contracts/rest-endpoints.md`
- `docker-compose.yml`
- `.env.example`
- `package.json` (root)
- `.github/workflows/`

---

## Integration Protocol

### Phase milestone completion checklist

Each agent follows this protocol when a phase milestone is ready for integration:

1. **Commit all work** with a clear conventional commit message:
   ```
   feat(backend): Phase 1 room service + game orchestrator
   ```

2. **Push branch** to remote:
   ```bash
   git push origin feature/backend
   ```

3. **Open a PR** targeting `main` with the milestone tag in the title:
   ```
   [Phase 1] Backend: Room Service + Game Orchestrator
   ```

4. **Lead review:** Technical Lead pulls the branch, runs:
   ```bash
   docker-compose up --build
   npm run typecheck
   npm run test -w backend
   ```

5. **Lead merges** with no-fast-forward:
   ```bash
   git merge --no-ff feature/backend
   git tag phase-1-backend-complete
   git push origin main --tags
   ```

6. **Other agents** rebase their branches on the updated `main`:
   ```bash
   git fetch origin
   git rebase origin/main
   ```

---

## Communication Contract

Agents communicate through file-based contracts only:

| Artifact | Location | Owner | Consumers |
|----------|----------|-------|-----------|
| WS event shapes | `docs/contracts/ws-events.md` | Lead | Android, Web |
| REST endpoint spec | `docs/contracts/rest-endpoints.md` | Lead | Android, Web |
| Full API contract | `docs/contracts/api-contract.md` | Lead | All agents |
| TypeScript contracts | `backend/src/types/contracts.ts` | Backend | Web (via copy/reference) |
| Kotlin models | `android/app/src/main/java/.../domain/` | Android | — |
| Web Zod schemas | `webapp/src/lib/contracts.ts` | Web | — |

Backend Agent must keep `backend/src/types/contracts.ts` in sync with the contract docs. Web Agent must mirror the same event shapes in `webapp/src/lib/contracts.ts`.

---

## Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature branch | `feature/<scope>` | `feature/backend` |
| Phase milestone | `phase<N>/<scope>-<description>` | `phase1/backend-room-service` |
| Bug fix | `fix/<scope>-<description>` | `fix/backend-token-rotation` |
| Hotfix | `hotfix/<description>` | `hotfix/crash-on-empty-room` |

---

## Environment Setup (each agent)

```bash
# 1. Clone & install root deps
npm install

# 2. Start infrastructure
docker-compose up -d postgres redis

# 3. Backend: apply migrations & seed
cd backend
npx prisma migrate dev
npm run seed
npm run dev

# 4. Web: start dev server
cd webapp
npm run dev

# Android: open android/ in Android Studio, sync Gradle, Run on emulator
```
