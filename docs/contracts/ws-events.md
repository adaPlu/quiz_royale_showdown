# WebSocket Events

Socket.IO uses `/ws` and a single canonical `message` event carrying a versioned envelope:

```json
{
  "type": "round:submit_answer",
  "version": "v1",
  "payload": {}
}
```

Authentication is passed during the Socket.IO handshake as `{ "token": "<accessToken>" }` or an `Authorization: Bearer <accessToken>` header.

## Client To Server

- `room:create` payload: `{ "isPrivate": true, "maxPlayers": 8 }`
- `room:join` payload: `{ "roomCode": "ABC123" }`
- `room:ready` payload: `{ "roomId": "01..." }`
- `room:start` payload: `{ "roomId": "01..." }`
- `room:leave` payload: `{ "roomId": "01..." }`
- `room:reconnect` payload: `{ "roomId": "01..." }`
- `round:submit_answer` payload: `{ "roomId": "01...", "questionId": "01...", "answerIndex": 2, "clientSentAt": "2026-04-18T12:00:22.741Z" }`
- `powerup:activate` payload: `{ "roomId": "01...", "powerUpId": "01...", "targetPlayerId": "01..." }`
- `client:heartbeat` payload: `{ "roomId": "01...", "sentAt": "2026-04-18T12:01:00.000Z" }`

## Server To Client

- `room:state_sync` payload: `{ "room": RoomSnapshot }`
- `room:player_joined` payload: `{ "roomId": "01...", "player": PlayerSummary }`
- `room:player_left` payload: `{ "roomId": "01...", "playerId": "01..." }`
- `room:ready_state` payload: `{ "roomId": "01...", "readyPlayerIds": ["01..."], "allReady": false }`
- `round:countdown_started` payload: `{ "roomId": "01...", "startsAt": "2026-04-18T12:00:05.000Z", "seconds": 5 }`
- `round:question_started` payload: `{ "roomId": "01...", "roundId": "01...", "questionId": "01...", "prompt": "...", "answers": ["A", "B", "C", "D"], "timeLimitMs": 20000, "startedAt": "2026-04-18T12:00:10.000Z" }`
- `round:answer_submitted` payload: `{ "roomId": "01...", "roundId": "01...", "playerId": "01...", "accepted": true }`
- `round:answer_locked` payload: `{ "roomId": "01...", "roundId": "01...", "lockedAt": "2026-04-18T12:00:30.000Z" }`
- `round:result` payload: `{ "roomId": "01...", "roundId": "01...", "correctAnswerIndex": 2, "rankings": [{ "playerId": "01...", "scoreDelta": 950, "totalScore": 4200 }] }`
- `round:elimination` payload: `{ "roomId": "01...", "eliminatedPlayerIds": ["01..."], "survivors": [PlayerSummary] }`
- `round:finale_started` payload: `{ "roomId": "01...", "finalistIds": ["01...", "01..."] }`
- `powerup:activated` payload: `{ "roomId": "01...", "powerUpId": "01...", "userId": "01...", "effect": {} }`
- `powerup:effect` payload: `{ "roomId": "01...", "powerUpId": "01...", "userId": "01...", "effect": {} }`
- `game:over` payload: `{ "roomId": "01...", "winnerId": "01...", "finalStandings": [{ "playerId": "01...", "rank": 1, "score": 8400, "xpAwarded": 840 }] }`
- `error` payload: `{ "code": "VALIDATION_ERROR", "message": "Invalid payload", "roomId": "01..." }`

`RoomSnapshot.phase` is one of `WAITING`, `COUNTDOWN`, `QUESTION_ACTIVE`, `ANSWER_LOCKED`, `ROUND_RESULT`, `ELIMINATION`, `FINALE`, or `GAME_OVER`.
