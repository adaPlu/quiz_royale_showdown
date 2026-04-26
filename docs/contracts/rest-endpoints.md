# REST Endpoints

This document lists routes mounted by the primary backend runtime in `backend/src/app.ts`.

Mounted routers:

- `/`
- `/health`
- `/api/v1/auth` — rate-limited: 20 req / 15 min per IP (`authLimiter`)
- `/api/v1/rooms`
- `/api/v1/users`
- `/api/v1/powerups`
- `/api/v1/cosmetics`
- `/api/v1/leaderboard`
- `/api/v1/challenges`
- `/api/v1/push`
- `/api/v1/admin`

All `/api/v1` routes share a general rate limit of 120 req / 1 min per IP (`apiLimiter`).

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
  "accessToken": "...",
  "refreshToken": "..."
}
```

Refresh accepts:

```json
{
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

Logout accepts the same refresh-token body and returns `204` on success.

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
  "roomCode": "ROYALE"
}
```

`roomCode` may be omitted or null for quick-play matchmaking.

Room responses include:

```json
{
  "roomId": "01H...",
  "roomCode": "ROYALE",
  "room": {},
  "hostUserId": "01H...",
  "config": {},
  "createdAt": "2026-04-25T00:00:00.000Z",
  "startedAt": null,
  "wsToken": "..."
}
```

`wsToken` is only included where the route issues one.

## Users

- `GET /api/v1/users/me` — requires JWT
- `GET /api/v1/users/:id/profile` — requires JWT

## Power-Ups

- `GET /api/v1/powerups/inventory` — requires JWT
- `POST /api/v1/powerups/use` — requires JWT

## Cosmetics

- `GET /api/v1/cosmetics` — requires JWT
- `POST /api/v1/cosmetics/equip` — requires JWT

## Leaderboard

- `GET /api/v1/leaderboard` — requires JWT

## Challenges

- `GET /api/v1/challenges` — requires JWT

## Push

- `POST /api/v1/push/register` — requires JWT

## Admin

Admin routes require elevated privileges. See `backend/src/routes/admin.ts`.

## Future / Unmounted

These feature areas are not yet mounted as REST routes in the primary backend runtime:

- Shop catalog, checkout, and receipt verification routes
- Seasons routes
- Friends routes
- Profile routes beyond `GET /api/v1/auth/me` and `GET /api/v1/users/me`
