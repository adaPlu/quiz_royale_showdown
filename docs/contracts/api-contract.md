# Quiz Royale Showdown API Contract

Version: `v1`

Base REST path: `/api/v1`

Socket.IO path: `/ws`

## REST

Implemented backend routes:

- `POST /auth/register` with `{ "email": "...", "displayName": "...", "password": "..." }`
- `POST /auth/login` with `{ "email": "...", "password": "..." }`
- `POST /auth/refresh` with `{ "refreshToken": "..." }`
- `POST /rooms` with `{ "isPrivate": true, "maxPlayers": 8 }`
- `POST /rooms/join` with `{ "roomCode": "ABC123" }`; omit `roomCode` for matchmaking
- `GET /rooms/:roomCode`
- `POST /rooms/:roomId/start`
- `POST /rooms/:roomId/leave`
- `GET /users/me`
- `GET /users/search?q=ali`
- `GET /users/:displayName/profile`
- `GET /powerups/inventory`
- `POST /powerups/use` returns `501`; power-up activation is canonical over WebSocket
- `GET /cosmetics`
- `GET /cosmetics/owned`
- `POST /cosmetics/equip` with `{ "cosmeticId": "01..." }`

JWT-protected REST endpoints use:

```http
Authorization: Bearer <accessToken>
```

REST errors use:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

## WebSocket

All Socket.IO traffic uses the `message` event with a `v1` envelope:

```json
{
  "type": "namespace:event",
  "version": "v1",
  "payload": {}
}
```

Client-to-server events:

- `room:create`
- `room:join`
- `room:ready`
- `room:start`
- `room:leave`
- `room:reconnect`
- `round:submit_answer`
- `powerup:activate`
- `client:heartbeat`

Server-to-client events:

- `room:state_sync`
- `room:player_joined`
- `room:player_left`
- `room:ready_state`
- `round:countdown_started`
- `round:question_started`
- `round:answer_submitted`
- `round:answer_locked`
- `round:result`
- `round:elimination`
- `round:finale_started`
- `powerup:activated`
- `powerup:effect`
- `game:over`
- `error`

See [ws-events.md](./ws-events.md) for payload shapes.
