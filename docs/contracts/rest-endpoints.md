# REST Endpoints

The endpoints below are the canonical Phase 1 backend surface. Auth, rooms, users, power-up inventory, and cosmetics are implemented in `feature/backend`; shop, competitive, challenges, friends, and admin remain contract-only.

## Auth

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

## Rooms

- `POST /api/v1/rooms`
- `POST /api/v1/rooms/join`
- `GET /api/v1/rooms/:roomCode`
- `POST /api/v1/rooms/:roomId/start`
- `POST /api/v1/rooms/:roomId/leave`

## Power-Ups

- `GET /api/v1/powerups/inventory`
- `POST /api/v1/powerups/use`

## Cosmetics

- `GET /api/v1/cosmetics`
- `GET /api/v1/cosmetics/owned`
- `POST /api/v1/cosmetics/equip`

## Shop

- `GET /api/v1/shop/catalog`
- `POST /api/v1/shop/checkout/google-play`
- `POST /api/v1/shop/checkout/stripe`
- `POST /api/v1/shop/receipts/verify`

## Competitive

- `GET /api/v1/leaderboard`
- `GET /api/v1/seasons/current`
- `GET /api/v1/seasons/:seasonId`
- `GET /api/v1/seasons/:seasonId/leaderboard`

## Challenges

- `GET /api/v1/challenges`
- `POST /api/v1/challenges/:challengeId/claim`

## Friends

- `GET /api/v1/friends`
- `POST /api/v1/friends/invite`
- `POST /api/v1/friends/:friendId/accept`
- `DELETE /api/v1/friends/:friendId`

## Admin

- `POST /api/v1/admin/questions/import`
- `POST /api/v1/admin/questions/activate`
- `POST /api/v1/admin/seasons`
- `POST /api/v1/admin/powerups/rebalance`
