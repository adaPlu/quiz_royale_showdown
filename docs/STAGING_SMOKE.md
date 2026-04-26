# Staging Smoke Runbook

Scope: primary repo backend deployment from
`c:\Users\plugu\AndroidStudioProjects\QuizGame`.

Do not use the separate Railway question workspace as proof that routes are
mounted in this repo. It is only for question-bank audit commands.

## Railway Readiness

Backend deployment files:

- `backend/Dockerfile` builds TypeScript, generates Prisma Client, and runs the
  lean runtime image on port `4000`.
- `backend/start.sh` runs Prisma migrations before `node dist/index.js`.
- `backend/railway.json` uses the Dockerfile builder and `/health` as the
  Railway health check.

Required Railway variables:

```text
NODE_ENV=production
PORT=4000
CORS_ORIGIN=<comma-free staging web origin>
DATABASE_URL=<Railway Postgres Prisma URL>
REDIS_URL=<Railway Redis URL>
JWT_ACCESS_SECRET=<random 32+ chars>
JWT_REFRESH_SECRET=<random 32+ chars>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
VAPID_PUBLIC_KEY=<optional for launch path>
VAPID_PRIVATE_KEY=<optional for launch path>
VAPID_SUBJECT=mailto:<ops address>
ADMIN_SECRET=<random 32+ chars>
```

Migration note:

- Fresh staging DB: no extra migration env is required. `start.sh` baselines the
  two superseded init snapshots and applies `20260425000000_init`.
- Already-shaped Railway DB: set `PRISMA_BASELINE_CURRENT_INIT=1` only when the
  current init schema has already been applied out-of-band and migration history
  needs to be reconciled.

Mounted launch surface:

- `GET /health`
- `/api/v1/auth/*`
- `/api/v1/rooms/*`
- Socket.IO on path `/ws`

Do not mount future routes for this smoke.

## PowerShell Setup

Run from the primary repo root:

```powershell
$env:STAGING_BASE = "https://<railway-service>.up.railway.app"
$env:API_BASE_URL = "$env:STAGING_BASE/api/v1"
$env:WS_BASE_URL = "$env:STAGING_BASE"
$env:SMOKE_TIMEOUT_MS = "330000"
$RunId = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
```

## GET /health

```powershell
Invoke-RestMethod "$env:STAGING_BASE/health" | ConvertTo-Json -Depth 8
```

Pass criteria: HTTP 200, `status` is `ok`, Postgres is `ok`, Redis is `ok`.

## Auth

```powershell
$Password = "password123"
$HostEmail = "staging-host-$RunId@example.com"
$GuestEmail = "staging-guest-$RunId@example.com"

$HostRegister = Invoke-RestMethod "$env:API_BASE_URL/auth/register" `
  -Method Post `
  -ContentType "application/json" `
  -Body (@{ email = $HostEmail; displayName = "Staging Host $RunId"; password = $Password } | ConvertTo-Json)

$GuestRegister = Invoke-RestMethod "$env:API_BASE_URL/auth/register" `
  -Method Post `
  -ContentType "application/json" `
  -Body (@{ email = $GuestEmail; displayName = "Staging Guest $RunId"; password = $Password } | ConvertTo-Json)

$HostLogin = Invoke-RestMethod "$env:API_BASE_URL/auth/login" `
  -Method Post `
  -ContentType "application/json" `
  -Body (@{ email = $HostEmail; password = $Password } | ConvertTo-Json)

$GuestLogin = Invoke-RestMethod "$env:API_BASE_URL/auth/login" `
  -Method Post `
  -ContentType "application/json" `
  -Body (@{ email = $GuestEmail; password = $Password } | ConvertTo-Json)

$HostHeaders = @{ Authorization = "Bearer $($HostLogin.accessToken)" }
$GuestHeaders = @{ Authorization = "Bearer $($GuestLogin.accessToken)" }
```

Pass criteria: both login responses include `accessToken`, `refreshToken`, and
`user.id`.

## Room Create / Join / Start

```powershell
$Room = Invoke-RestMethod "$env:API_BASE_URL/rooms" `
  -Method Post `
  -Headers $HostHeaders `
  -ContentType "application/json" `
  -Body (@{ isPrivate = $true; maxPlayers = 2 } | ConvertTo-Json)

$Joined = Invoke-RestMethod "$env:API_BASE_URL/rooms/join" `
  -Method Post `
  -Headers $GuestHeaders `
  -ContentType "application/json" `
  -Body (@{ roomCode = $Room.roomCode } | ConvertTo-Json)

$Started = Invoke-RestMethod "$env:API_BASE_URL/rooms/$($Room.roomId)/start" `
  -Method Post `
  -Headers $HostHeaders

$Room | ConvertTo-Json -Depth 8
$Joined | ConvertTo-Json -Depth 8
$Started | ConvertTo-Json -Depth 8
```

Pass criteria: create returns `201`, join returns the same `roomCode`, and start
returns a room payload. If this command is run without socket clients connected,
the game loop may not complete; use the smoke scripts for the full socket path.

## Socket.IO `/ws`

This checks the deployed Socket.IO path, auth middleware, and canonical
`message` envelope.

```powershell
node -e "const { io } = require('socket.io-client'); const s = io(process.env.WS_BASE_URL, { path: '/ws', transports: ['websocket'], auth: { token: process.env.HOST_ACCESS_TOKEN }, reconnection: false, timeout: 15000 }); s.on('connect', () => { console.log('connected', s.id); s.emit('message', { type: 'room:join', version: 'v1', payload: { roomCode: process.env.ROOM_CODE } }); setTimeout(() => s.disconnect(), 2000); }); s.on('message', (m) => console.log(JSON.stringify(m))); s.on('connect_error', (e) => { console.error(e.message); process.exit(1); });"
```

Before running that command, export the values from the room smoke:

```powershell
$env:HOST_ACCESS_TOKEN = $HostLogin.accessToken
$env:ROOM_CODE = $Room.roomCode
```

Pass criteria: `connected <socket-id>` prints and at least one `message` envelope
is received or no auth/connect error occurs before disconnect.

## Phase 1 Smoke

```powershell
npm run smoke:phase1
```

Pass criteria: registers/logs in two users, blocks one-player start, creates and
joins a room, connects both sockets on `/ws`, starts the room, observes
`round:countdown_started`, then observes `round:question_started` or an expected
canonical `error` only when `EXPECT_START_ERROR=1`.

## Phase 2 Smoke

```powershell
npm run smoke:phase2
```

Pass criteria: reaches `game:over` and records all checkpoints:
`roomStateSync`, `countdownStarted`, `questionStarted`, `answerLocked`,
`roundResult`, and `gameOver`.

## Railway Question Audit

Keep this separate from the primary repo:

```powershell
cd c:\Users\plugu\AndroidStudioProjects\QuizGame-main\backend
railway run npm run audit:questions
```

Pass criteria: command exits 0 and reports active question count plus category
and difficulty health for the Railway question database.
