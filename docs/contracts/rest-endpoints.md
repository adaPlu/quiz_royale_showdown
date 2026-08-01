# REST Endpoints

This document lists routes mounted by the primary backend runtime in `backend/src/app.ts`.

Mounted routers:

- `/`
- `/health`
- `/api/v1/admin`
- `/api/v1/auth`
- `/api/v1/challenges`
- `/api/v1/cosmetics`
- `/api/v1/leaderboard`
- `/api/v1/powerups`
- `/api/v1/push`
- `/api/v1/rooms`
- `/api/v1/users`

Requests to unmounted routes return the standard 404 error response.

## Root

- `GET /`

Returns service identity and readiness status.

## Health

- `GET /health`

Checks PostgreSQL and Redis. Returns `200` when healthy and `503` when a dependency is unhealthy.

## Auth

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

`GET /api/v1/auth/me` requires `Authorization: Bearer <accessToken>`.

Register accepts:

```json
{
  "email": "alice@example.com",
  "username": "alice",
  "displayName": "Alice",
  "password": "sup3rS3cr3t"
}
```

`displayName` or `username` is required. `username` is optional and must be alphanumeric when present.

Register and login return:

```json
{
  "user": {
    "id": "01H...",
    "email": "alice@example.com",
    "displayName": "Alice"
  },
  "accessToken": "..."
}
```

Register and login set the refresh token in the `quiz_refresh` HttpOnly cookie by default. Native/mobile clients that cannot use HttpOnly cookies may request a JSON refresh token with `x-refresh-token-response: body`.

Refresh accepts:

```json
{
  "refreshToken": "..."
}
```

Refresh returns:

```json
{
  "accessToken": "..."
}
```

Refresh sets a rotated refresh token in the `quiz_refresh` HttpOnly cookie by default. Body-token clients may send the refresh token in JSON and must set `x-refresh-token-response: body` to receive the rotated refresh token in JSON. Cookie-backed refresh and logout requests require `x-csrf-protection: 1`.

Logout accepts the same refresh-token body, or the `quiz_refresh` cookie with `x-csrf-protection: 1`, and returns `204` on success.

## Rooms

- `POST /api/v1/rooms`
- `POST /api/v1/rooms/join`
- `GET /api/v1/rooms/:roomCode`
- `POST /api/v1/rooms/:roomId/start`
- `POST /api/v1/rooms/:roomId/leave`

All room endpoints require `Authorization: Bearer <accessToken>` except `GET /api/v1/rooms/:roomCode`.

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
  "roomCode": "ABCD2345"
}
```

`roomCode` may be omitted or null for quick-play matchmaking.

Room responses include:

```json
{
  "roomId": "01H...",
  "roomCode": "ABCD2345",
  "room": {},
  "hostUserId": "01H...",
  "config": {},
  "createdAt": "2026-04-25T00:00:00.000Z",
  "startedAt": null,
  "wsToken": "..."
}
```

`wsToken` is only included where the route issues one.

## Profile / Users

- `GET /api/v1/users/me`
- `GET /api/v1/users/search?q=term`
- `GET /api/v1/users/:displayName/profile`

All user endpoints require `Authorization: Bearer <accessToken>`.

## Leaderboard

- `GET /api/v1/leaderboard?season=current&limit=100`
- `GET /api/v1/leaderboard/friends`

`/leaderboard/friends` requires auth and currently returns an empty list until the friends system is added.

## Power-Ups

- `GET /api/v1/powerups/inventory`
- `POST /api/v1/powerups/use`

Inventory requires auth. REST activation intentionally returns `501 USE_VIA_WEBSOCKET`; gameplay activation is implemented through the canonical `powerup:activate` socket message.

## Cosmetics

- `GET /api/v1/cosmetics`
- `GET /api/v1/cosmetics/owned`
- `POST /api/v1/cosmetics/equip`

Owned and equip endpoints require auth. Equip accepts:

```json
{
  "cosmeticId": "01H..."
}
```

## Challenges

- `GET /api/v1/challenges/daily`
- `POST /api/v1/challenges/:id/progress`

Both endpoints require auth.

## Push

- `GET /api/v1/push/vapid-public-key`
- `POST /api/v1/push/subscribe`
- `DELETE /api/v1/push/subscribe`
- `POST /api/v1/push/fcm-token`

Subscription and token mutation endpoints require auth. Web push remains feature-flagged in the web client.

## Admin

- `GET /api/v1/admin/questions/count`
- `POST /api/v1/admin/questions/generate`
- `POST /api/v1/admin/questions/refill`

Admin endpoints require `x-admin-key` and are rate limited.

## Future / Unmounted

These feature areas are not mounted as REST routes in the primary backend runtime:

- Shop catalog, checkout, and receipt verification routes
- Seasons routes
- Friends routes
