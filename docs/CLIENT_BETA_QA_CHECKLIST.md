# Client Beta QA Checklist

Use this checklist for every web and Android beta smoke pass against the current staging or local full-loop backend.

## Scope Guard

- Profile/users, global leaderboard, cosmetics, power-ups, challenges, push, and admin routes are mounted in the backend, but are not core room/game/results launch-path dependencies until staging smoke covers them.
- Web profile, leaderboard, cosmetics, and power-up inventory must stay non-blocking for auth, room, game, and results flow. Web push remains feature-flagged off unless explicitly enabled for the test pass.
- Android profile, leaderboard, cosmetics, and power-up UI are implemented client surfaces; treat them as exploratory unless the current beta pass includes backend route smoke.
- Shop, friends, seasons, payment, and purchases remain future/unmounted and must stay hidden, mocked, or guarded.

## Web Smoke

- Sign in or register, then land on Home without console errors.
- Create a private room, join a second client by code, and verify both clients show the lobby roster.
- Start the game with at least two players and verify lobby -> countdown -> first question.
- Use keyboard shortcuts `1` through `4` to answer while unlocked.
- Verify keyboard shortcuts do not submit while an answer is locked, after round result, or while focus is in an input/select/textarea/contenteditable field.
- Submit by button click and verify selected answer locks locally and round result appears.
- Continue answering every served round until `game:over`; do not stop after the first round result.
- Interrupt the socket/network during an active question and verify reconnect UI appears, then clears after reconnect and room state resumes on the same room.
- Complete the game and verify game -> results navigation with final standings for both clients.
- Open Profile and Leaderboard routes and verify any backend calls are handled without breaking room/game/results flow.

## Android Smoke

- Sign in or register, then land on Home.
- Create or join a room by code and verify lobby state.
- Start or enter gameplay and verify question text, answers, player list, and power-up tray render.
- Verify CountdownRing starts full for the active question and decreases according to `timerSeconds / timeLimitMs`.
- Submit an answer and verify local locked selection feedback.
- Continue answering every served round until `game:over`; do not stop after the first round result.
- Interrupt the socket/network during an active question and verify the reconnect overlay appears, then clears after reconnect on the same room.
- Complete the game and verify navigation to Results with final standings.
- Open any non-core profile/leaderboard/cosmetics entry points only as exploratory checks unless the pass explicitly includes those backend route checks; they must not block room/game/results flow.

## Build Checks

- Web: `npm run typecheck` from `webapp`.
- Web: `npm run build` from `webapp`.
- Android: `.\gradlew.bat :app:assembleDebug` from `android`.
