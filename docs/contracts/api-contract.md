# Quiz Royale Showdown — API Contract

**Version:** v1  
**Last Updated:** 2026-04-18  
**Base URL (REST):** `https://api.quizroyale.io/api/v1`  
**WebSocket endpoint:** `wss://api.quizroyale.io/ws`

---

## 1. WebSocket Event Envelope

All Socket.IO messages (both directions) use the `message` event name and this typed envelope:

```json
{
  "type": "namespace:event_name",
  "version": "v1",
  "payload": { /* event-specific object */ }
}
```

| Field     | Type     | Description                          |
|-----------|----------|--------------------------------------|
| `type`    | `string` | Namespaced event identifier          |
| `version` | `"v1"`   | Protocol version (hard literal)      |
| `payload` | `object` | Event-specific data (never null)     |

---

## 2. WebSocket — Server → Client Events

### `room:state_sync`
Full room snapshot emitted immediately after a player joins or re-syncs.

```json
{
  "type": "room:state_sync",
  "version": "v1",
  "payload": {
    "room": {
      "roomId": "01HXYZ...",
      "code": "ROYALE",
      "phase": "WAITING",
      "roundNumber": 0,
      "totalRounds": 10,
      "players": [
        { "id": "01H...", "displayName": "Alice", "score": 0, "streak": 0, "isEliminated": false }
      ]
    }
  }
}
```

### `room:player_joined`
Broadcast to the room when a new player joins.

```json
{
  "type": "room:player_joined",
  "version": "v1",
  "payload": {
    "roomId": "01HXYZ...",
    "player": { "id": "01H...", "displayName": "Bob", "score": 0, "streak": 0, "isEliminated": false }
  }
}
```

### `room:player_left`
Broadcast when a player disconnects or explicitly leaves.

```json
{
  "type": "room:player_left",
  "version": "v1",
  "payload": { "roomId": "01HXYZ...", "playerId": "01H..." }
}
```

### `round:countdown_started`
Signals all clients to show the pre-round countdown animation.

```json
{
  "type": "round:countdown_started",
  "version": "v1",
  "payload": {
    "roomId": "01HXYZ...",
    "startsAt": "2026-04-18T12:00:05.000Z",
    "seconds": 5
  }
}
```

### `round:question_started`
Delivers the question. Clients must NOT trust `timeLimitMs` alone — use `startedAt` + `timeLimitMs` for server-authoritative timing.

```json
{
  "type": "round:question_started",
  "version": "v1",
  "payload": {
    "roomId": "01HXYZ...",
    "roundId": "01HRND...",
    "questionId": "01HQST...",
    "prompt": "What is the capital of France?",
    "answers": ["Berlin", "Madrid", "Paris", "Rome"],
    "timeLimitMs": 20000,
    "startedAt": "2026-04-18T12:00:10.000Z"
  }
}
```

### `round:answer_locked`
Server closes submission window. Clients must disable answer buttons.

```json
{
  "type": "round:answer_locked",
  "version": "v1",
  "payload": {
    "roomId": "01HXYZ...",
    "roundId": "01HRND...",
    "lockedAt": "2026-04-18T12:00:30.000Z"
  }
}
```

### `round:result`
Reveals correct answer and updated scores for all players.

```json
{
  "type": "round:result",
  "version": "v1",
  "payload": {
    "roomId": "01HXYZ...",
    "roundId": "01HRND...",
    "correctAnswerIndex": 2,
    "rankings": [
      { "playerId": "01H...", "scoreDelta": 950, "totalScore": 4200 }
    ]
  }
}
```

### `round:elimination`
Reports which players were eliminated and who survived.

```json
{
  "type": "round:elimination",
  "version": "v1",
  "payload": {
    "roomId": "01HXYZ...",
    "eliminatedPlayerIds": ["01HELIM..."],
    "survivors": [
      { "id": "01H...", "displayName": "Alice", "score": 4200, "streak": 3, "isEliminated": false }
    ]
  }
}
```

### `round:finale_started`
Announces the final showdown round with surviving finalists.

```json
{
  "type": "round:finale_started",
  "version": "v1",
  "payload": {
    "roomId": "01HXYZ...",
    "finalistIds": ["01HA...", "01HB..."]
  }
}
```

### `game:over`
Final event. Contains winner and full standings with XP awarded.

```json
{
  "type": "game:over",
  "version": "v1",
  "payload": {
    "roomId": "01HXYZ...",
    "winnerId": "01HWINNER...",
    "finalStandings": [
      { "playerId": "01H...", "rank": 1, "score": 8400, "xpAwarded": 500 }
    ]
  }
}
```

---

## 3. WebSocket — Client → Server Events

### `room:join`
Join a room by its short code.

```json
{
  "type": "room:join",
  "version": "v1",
  "payload": { "roomCode": "ROYALE" }
}
```

### `round:submit_answer`
Submit the selected answer. `clientSentAt` is used for latency measurement only — the server uses its own receipt timestamp for scoring.

```json
{
  "type": "round:submit_answer",
  "version": "v1",
  "payload": {
    "roomId": "01HXYZ...",
    "questionId": "01HQST...",
    "answerIndex": 2,
    "clientSentAt": "2026-04-18T12:00:22.741Z"
  }
}
```

### `powerup:activate`
Activate a power-up, optionally targeting another player.

```json
{
  "type": "powerup:activate",
  "version": "v1",
  "payload": {
    "roomId": "01HXYZ...",
    "powerUpId": "01HPU...",
    "targetPlayerId": "01HTARGET..."
  }
}
```

### `client:heartbeat`
Periodic presence ping (every 30 s). Used for latency tracking and connection health.

```json
{
  "type": "client:heartbeat",
  "version": "v1",
  "payload": {
    "roomId": "01HXYZ...",
    "sentAt": "2026-04-18T12:01:00.000Z"
  }
}
```

---

## 4. REST Endpoints

### Auth

| Method | Path                      | Auth | Description                   |
|--------|---------------------------|------|-------------------------------|
| POST   | `/api/v1/auth/register`   | —    | Register a new account        |
| POST   | `/api/v1/auth/login`      | —    | Login, receive JWT pair       |
| POST   | `/api/v1/auth/refresh`    | —    | Rotate access + refresh token |
| POST   | `/api/v1/auth/logout`     | —    | Revoke refresh token          |
| GET    | `/api/v1/auth/me`         | JWT  | Current user profile          |

**Register request:**
```json
{ "email": "alice@example.com", "displayName": "Alice", "password": "sup3rS3cr3t" }
```
**Register response (201):**
```json
{
  "user": { "id": "01H...", "email": "alice@example.com", "displayName": "Alice" },
  "tokens": { "accessToken": "...", "refreshToken": "..." }
}
```

**Token lifetimes:** `accessToken` = 15 min, `refreshToken` = 7 days.

---

### Rooms

| Method | Path                        | Auth | Description                    |
|--------|-----------------------------|------|--------------------------------|
| POST   | `/api/v1/rooms`             | JWT  | Create a new room (host)       |
| POST   | `/api/v1/rooms/join`        | JWT  | Join by code or quick-play matchmaking |
| GET    | `/api/v1/rooms/:roomCode`   | —    | Get room info by 6-char code   |
| POST   | `/api/v1/rooms/:roomId/start` | JWT | Host starts the countdown      |
| POST   | `/api/v1/rooms/:roomId/leave` | JWT | Leave a room                   |

---

### Power-Ups

| Method | Path                             | Auth | Description              |
|--------|----------------------------------|------|--------------------------|
| GET    | `/api/v1/powerups`               | JWT  | List all power-up types  |
| GET    | `/api/v1/powerups/inventory`     | JWT  | Current user's inventory |
| POST   | `/api/v1/powerups/:id/equip`     | JWT  | Equip a power-up slot    |

---

### Cosmetics

| Method | Path                              | Auth | Description               |
|--------|-----------------------------------|------|---------------------------|
| GET    | `/api/v1/cosmetics`               | JWT  | All cosmetic items        |
| GET    | `/api/v1/cosmetics/inventory`     | JWT  | Owned cosmetics           |
| POST   | `/api/v1/cosmetics/:id/equip`     | JWT  | Equip a cosmetic          |

---

### Shop

| Method | Path                                   | Auth | Description                  |
|--------|----------------------------------------|------|------------------------------|
| GET    | `/api/v1/shop/catalog`                 | JWT  | Available SKUs               |
| POST   | `/api/v1/shop/checkout/google-play`    | JWT  | Verify Google Play purchase  |
| POST   | `/api/v1/shop/checkout/stripe`         | JWT  | Create Stripe checkout session |
| POST   | `/api/v1/shop/receipts/verify`         | JWT  | Verify a receipt             |

---

### Competitive

| Method | Path                                  | Auth | Description            |
|--------|---------------------------------------|------|------------------------|
| GET    | `/api/v1/leaderboard`                 | JWT  | Global leaderboard     |
| GET    | `/api/v1/seasons/current`             | —    | Active season metadata |
| GET    | `/api/v1/seasons/:seasonId`           | —    | Season info            |
| GET    | `/api/v1/seasons/:seasonId/leaderboard` | JWT | Season leaderboard   |

---

### Challenges

| Method | Path                                  | Auth | Description           |
|--------|---------------------------------------|------|-----------------------|
| GET    | `/api/v1/challenges`                  | JWT  | Active daily challenges |
| POST   | `/api/v1/challenges/:id/claim`        | JWT  | Claim a completed challenge |

---

### Friends

| Method | Path                         | Auth | Description              |
|--------|------------------------------|------|--------------------------|
| GET    | `/api/v1/friends`            | JWT  | Friends list             |
| POST   | `/api/v1/friends/invite`     | JWT  | Send a friend request    |
| POST   | `/api/v1/friends/:id/accept` | JWT  | Accept a friend request  |
| DELETE | `/api/v1/friends/:id`        | JWT  | Remove a friend          |

---

### Admin (service-account only)

| Method | Path                               | Auth         | Description                 |
|--------|------------------------------------|--------------|-----------------------------|
| POST   | `/api/v1/admin/questions/import`   | Service JWT  | Bulk import questions       |
| POST   | `/api/v1/admin/questions/activate` | Service JWT  | Toggle question active flag |
| POST   | `/api/v1/admin/seasons`            | Service JWT  | Create a new season         |
| POST   | `/api/v1/admin/powerups/rebalance` | Service JWT  | Adjust power-up parameters  |

---

## 5. Error Format

All REST error responses use this shape:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "issues": { /* Zod flatten output, validation errors only */ }
}
```

Standard HTTP status codes apply: 400 (validation), 401 (auth), 403 (forbidden), 404, 409 (conflict), 429 (rate-limit), 500.

---

## 6. Auth Header

```
Authorization: Bearer <accessToken>
```

WebSocket auth is passed in the Socket.IO handshake auth object:
```json
{ "auth": { "token": "<accessToken>" } }
```

---

## 7. Primary Keys

All primary keys are ULIDs: 26-character, time-sortable, URL-safe (`VARCHAR(26)` in PostgreSQL).

---

## 8. Versioning

Breaking changes bump the version prefix in the WS `version` field and add a new `/api/v2/` REST prefix. All v1 endpoints remain supported for at least one release cycle.
