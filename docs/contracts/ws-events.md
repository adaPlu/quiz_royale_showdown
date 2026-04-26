# WebSocket Contract

The primary backend mounts Socket.IO at path `/ws`.

All active client and server messages use the Socket.IO event name `message` with this envelope:

```json
{
  "type": "room:state_sync",
  "version": "v1",
  "payload": {}
}
```

The previous direct Socket.IO event naming style, such as `v1:*`, is retired from the active contract. Clients must not emit or listen for direct `v1:*` event names.

Authentication is passed in the Socket.IO handshake:

```json
{
  "auth": {
    "token": "<accessToken>"
  }
}
```

An `Authorization: Bearer <accessToken>` handshake header is also accepted by the backend middleware.

## Server to Client

All events below are emitted on Socket.IO event `message`.

1. `room:state_sync`
   Full room snapshot after join or resync.
2. `room:player_joined`
   Announces a newly joined player.
3. `room:player_left`
   Announces a disconnected player.
4. `round:countdown_started`
   Countdown before the next question starts.
5. `round:question_started`
   Question prompt, answers, and server start time.
6. `round:answer_locked`
   Server lock signal when submissions close.
7. `round:result`
   Correct answer and score deltas.
8. `round:elimination`
   Eliminated player ids and survivor list.
9. `round:finale_started`
   Transition into the final showdown.
10. `game:over`
    Winner and final standings.
11. `powerup:loot_drop`
    Sent individually to each finalist immediately after `game:over`. Payload: `{ powerupType: string, quantity: number }`.
12. `error`
    Contract error envelope.

## Client to Server

All events below are sent on Socket.IO event `message`.

1. `room:join`
   Join a room by short code.
2. `round:submit_answer`
   Submit the selected answer index with client timestamp.
3. `powerup:activate`
   Activate an in-game power-up, optionally against a target.
4. `client:heartbeat`
   Presence and latency heartbeat.
