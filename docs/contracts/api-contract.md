# Quiz Royale Showdown API Contract

**Version:** v1  
**Last Updated:** 2026-04-25  
**Base URL (REST v1):** `https://api.quizroyale.io/api/v1`  
**WebSocket endpoint:** `wss://api.quizroyale.io/ws`

This contract reflects the routes and Socket.IO behavior mounted by the primary backend runtime.

## 1. WebSocket Envelope

Socket.IO is mounted at path `/ws`.

All active client and server messages use Socket.IO event name `message` with this envelope:

```json
{
  "type": "namespace:event_name",
  "version": "v1",
  "payload": {}
}
```

| Field | Type | Description |
| --- | --- | --- |
| `type` | `string` | Namespaced event identifier |
| `version` | `"v1"` | Protocol version |
| `payload` | `object` | Event-specific data |

The direct Socket.IO event naming style `v1:*` is retired from the active contract. Clients must emit and listen on `message`, then branch on the envelope `type`.

WebSocket auth is passed in the Socket.IO handshake:

```json
{
  "auth": {
    "token": "<accessToken>"
  }
}
```

The backend also accepts an `Authorization: Bearer <accessToken>` handshake header.

## 2. WebSocket Server to Client Events

All events in this section are emitted on Socket.IO event `message`.

### `room:state_sync`

Full room snapshot after join or resync.

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
        {
          "id": "01H...",
          "displayName": "Alice",
          "avatarUrl": "https://...",
          "score": 0,
          "streak": 0,
          "isEliminated": false
        }
      ]
    }
  }
}
```

### `room:player_joined`

Broadcast to other room members when a new player joins through the socket path.

```json
{
  "type": "room:player_joined",
  "version": "v1",
  "payload": {
    "roomId": "01HXYZ...",
    "player": {
      "id": "01H...",
      "displayName": "Bob",
      "score": 0,
      "streak": 0,
      "isEliminated": false
    }
  }
}
```

### `room:player_left`

Broadcast when a connected socket disconnects from a joined room.

```json
{
  "type": "room:player_left",
  "version": "v1",
  "payload": {
    "roomId": "01HXYZ...",
    "playerId": "01H..."
  }
}
```

### `round:countdown_started`

Countdown before the next question starts.

```json
{
  "type": "round:countdown_started",
  "version": "v1",
  "payload": {
    "roomId": "01HXYZ...",
    "startsAt": "2026-04-25T12:00:05.000Z",
    "seconds": 5
  }
}
```

### `round:question_started`

Question prompt, answer choices, and server-authoritative start time.

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
    "startedAt": "2026-04-25T12:00:10.000Z"
  }
}
```

### `round:answer_locked`

Server closes the submission window.

```json
{
  "type": "round:answer_locked",
  "version": "v1",
  "payload": {
    "roomId": "01HXYZ...",
    "roundId": "01HRND...",
    "lockedAt": "2026-04-25T12:00:30.000Z"
  }
}
```

### `round:result`

Correct answer and score changes.

```json
{
  "type": "round:result",
  "version": "v1",
  "payload": {
    "roomId": "01HXYZ...",
    "roundId": "01HRND...",
    "correctAnswerIndex": 2,
    "rankings": [
      {
        "playerId": "01H...",
        "scoreDelta": 950,
        "totalScore": 4200
      }
    ]
  }
}
```

### `round:elimination`

Eliminated players and remaining survivors.

```json
{
  "type": "round:elimination",
  "version": "v1",
  "payload": {
    "roomId": "01HXYZ...",
    "eliminatedPlayerIds": ["01HELIM..."],
    "survivors": [
      {
        "id": "01H...",
        "displayName": "Alice",
        "score": 4200,
        "streak": 3,
        "isEliminated": false
      }
    ]
  }
}
```

### `round:finale_started`

Final showdown transition.

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

Final standings.

```json
{
  "type": "game:over",
  "version": "v1",
  "payload": {
    "roomId": "01HXYZ...",
    "winnerId": "01HWINNER...",
    "finalStandings": [
      {
        "playerId": "01H...",
        "rank": 1,
        "score": 8400,
        "xpAwarded": 500
      }
    ]
  }
}
```

### `error`

Socket error envelope.

```json
{
  "type": "error",
  "version": "v1",
  "payload": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid payload",
    "details": {}
  }
}
```

## 3. WebSocket Client to Server Events

All events in this section are sent on Socket.IO event `message`.

### `room:join`

Join a room by room code.

```json
{
  "type": "room:join",
  "version": "v1",
  "payload": {
    "roomCode": "ROYALE"
  }
}
```

The backend currently also accepts messages without a `version` field as v1 for Android compatibility.

### `round:submit_answer`

Submit an answer for the active question.

```json
{
  "type": "round:submit_answer",
  "version": "v1",
  "payload": {
    "roomId": "01HXYZ...",
    "questionId": "01HQST...",
    "answerIndex": 2,
    "clientSentAt": "2026-04-25T12:00:22.741Z"
  }
}
```

### `powerup:activate`

Activate an in-game power-up. This is a mounted socket message handler, not a mounted REST feature area.

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

Client presence and latency heartbeat.

```json
{
  "type": "client:heartbeat",
  "version": "v1",
  "payload": {
    "roomId": "01HXYZ...",
    "sentAt": "2026-04-25T12:01:00.000Z"
  }
}
```

## 4. Mounted REST Endpoints

The primary backend runtime mounts:

- `GET /`
- `GET /health`
- `/api/v1/auth/*`
- `/api/v1/rooms/*`

### Auth

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | None | Register a new account |
| POST | `/api/v1/auth/login` | None | Login and receive token pair |
| POST | `/api/v1/auth/refresh` | None | Rotate refresh token |
| POST | `/api/v1/auth/logout` | None | Revoke refresh token |
| GET | `/api/v1/auth/me` | JWT | Current authenticated user |

Register accepts `email`, `password`, and either `displayName` or `username`.

Register and login return top-level tokens:

```json
{
  "user": {
    "id": "01H...",
    "email": "alice@example.com",
    "displayName": "Alice"
  },
  "accessToken": "...",
  "refreshToken": "..."
}
```

Refresh returns:

```json
{
  "accessToken": "...",
  "refreshToken": "..."
}
```

### Rooms

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/v1/rooms` | JWT | Create a room |
| POST | `/api/v1/rooms/join` | JWT | Join by code or quick-play matchmaking |
| GET | `/api/v1/rooms/:roomCode` | None | Get room by 6-character code |
| POST | `/api/v1/rooms/:roomId/start` | JWT | Host starts game countdown |
| POST | `/api/v1/rooms/:roomId/leave` | JWT | Leave a room |

Create room accepts:

```json
{
  "isPrivate": true,
  "maxPlayers": 8
}
```

Join room accepts:

```json
{
  "roomCode": "ROYALE"
}
```

`roomCode` may be omitted or null for quick-play matchmaking.

## 5. Future / Unmounted REST Areas

The following areas are future or unmounted in the primary backend runtime. Do not treat these as active REST contract endpoints unless a router is mounted in `backend/src/app.ts`.

| Area | Status |
| --- | --- |
| Power-ups REST catalog, inventory, equip | Future / unmounted |
| Cosmetics catalog, inventory, equip | Future / unmounted |
| Shop catalog, checkout, receipt verification | Future / unmounted |
| Leaderboard | Future / unmounted |
| Seasons | Future / unmounted |
| Challenges | Future / unmounted |
| Friends | Future / unmounted |
| Admin | Future / unmounted |
| Profile routes beyond `GET /api/v1/auth/me` | Future / unmounted |

## 6. Error Format

REST error responses use this shape:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "issues": {}
}
```

`issues` is present for validation errors.

## 7. Auth Header

REST endpoints that require auth use:

```text
Authorization: Bearer <accessToken>
```

## 8. Primary Keys

Primary application IDs are ULIDs: 26-character, time-sortable, URL-safe strings stored as `VARCHAR(26)` in PostgreSQL.

## 9. Versioning

Breaking changes bump the WebSocket envelope `version` and add a new REST prefix such as `/api/v2`.
