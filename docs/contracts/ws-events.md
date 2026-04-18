# WebSocket Contract

This starter contract uses a versioned envelope on the `message` socket event:

```json
{
  "type": "room:state_sync",
  "version": "v1",
  "payload": {}
}
```

The exact event names below were inferred from the handoff summary because the overseer text was not present on disk in this workspace.

## Server to Client

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

## Client to Server

1. `room:join`
   Join a room by short code.
2. `round:submit_answer`
   Submit the selected answer index with client timestamp.
3. `powerup:activate`
   Activate a power-up, optionally against a target.
4. `client:heartbeat`
   Presence and latency heartbeat.
