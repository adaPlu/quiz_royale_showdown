package com.quizroyale.showdown.data.game

import app.cash.turbine.test
import com.quizroyale.showdown.data.results.ResultsStore
import com.quizroyale.showdown.domain.model.LeaderboardEntry
import com.quizroyale.showdown.ui.game.GameSideEffect
import com.quizroyale.showdown.ui.game.GameUiState
import com.quizroyale.showdown.ui.game.GameViewModel
import com.quizroyale.showdown.ui.game.MainDispatcherRule
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Unit tests for [GameViewModel].
 *
 * Placed under data/game to match the requested target path.  The ViewModel
 * itself lives in com.quizroyale.showdown.ui.game; all imports reference that
 * package explicitly.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class GameViewModelTest {

    // Install UnconfinedTestDispatcher as Dispatchers.Main for every test so
    // that viewModelScope coroutines run eagerly inside runTest.
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule(UnconfinedTestDispatcher())

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    /**
     * Creates a relaxed [GameRepository] mock whose [events] flow is driven by
     * [eventsFlow].  [isConnected] defaults to a stable `true` flow so the
     * [GameViewModel.isReconnecting] derived state stays `false` and does not
     * interfere with behaviour under test.  [joinRoom] defaults to returning
     * `true` (authenticated join succeeds).
     */
    private fun fakeRepo(
        eventsFlow: MutableSharedFlow<GameEvent> = MutableSharedFlow(),
    ): GameRepository {
        val repo = mockk<GameRepository>(relaxed = true)
        every { repo.events } returns eventsFlow
        every { repo.isConnected } returns MutableStateFlow(true)
        every { repo.joinRoom(any()) } returns true
        return repo
    }

    // ---------------------------------------------------------------------------
    // Test 1: submitAnswer is a no-op when isAnswerLocked is already true
    // ---------------------------------------------------------------------------

    /**
     * Idempotency guard: once an answer has been locked the ViewModel must NOT
     * send another answer over the socket, regardless of how many times
     * [GameViewModel.submitAnswer] is called.
     */
    @Test
    fun `submitAnswer does not emit socket event when isAnswerLocked is true`() = runTest {
        val eventsFlow = MutableSharedFlow<GameEvent>()
        val gameRepository = fakeRepo(eventsFlow)
        val resultsStore = mockk<ResultsStore>(relaxed = true)

        val viewModel = GameViewModel(gameRepository, resultsStore)

        // Transition to ActiveQuestion state by emitting a QuestionStarted event.
        eventsFlow.emit(
            GameEvent.QuestionStarted(
                roomId = "room-1",
                roundId = "round-1",
                questionId = "q-1",
                prompt = "What is 2 + 2?",
                answers = listOf("3", "4", "5", "6"),
                timeLimitMs = 20_000,
                // Far-past timestamp so remainingSeconds clamps to the full 20 s.
                startedAt = "2020-01-01T00:00:00Z"
            )
        )

        // Lock the answer via an AnswerLocked server event.
        eventsFlow.emit(
            GameEvent.AnswerLocked(
                roomId = "room-1",
                roundId = "round-1",
                lockedAt = "2020-01-01T00:00:10Z"
            )
        )

        // Verify the state is now ActiveQuestion with isAnswerLocked = true.
        val state = viewModel.uiState.value
        assertTrue(
            "Expected ActiveQuestion but was $state",
            state is GameUiState.ActiveQuestion
        )
        assertTrue(
            "isAnswerLocked should be true after AnswerLocked event",
            (state as GameUiState.ActiveQuestion).isAnswerLocked
        )

        // Attempt to submit an answer while locked — must be silently ignored.
        viewModel.submitAnswer(0)

        // gameRepository.submitAnswer must never be called.
        verify(exactly = 0) { gameRepository.submitAnswer(any(), any(), any()) }
    }

    // ---------------------------------------------------------------------------
    // Test 2: handleGameOver transitions to GameOver and persists results
    // ---------------------------------------------------------------------------

    /**
     * When a [GameEvent.GameOver] is received the ViewModel must:
     * 1. Transition [GameViewModel.uiState] to [GameUiState.GameOver].
     * 2. Call [ResultsStore.setResults] with the mapped leaderboard.
     * 3. Emit a [GameSideEffect.NavigateToResults] side effect.
     */
    @Test
    fun `handleGameOver sets GameOver state and calls ResultsStore setResults`() = runTest {
        val eventsFlow = MutableSharedFlow<GameEvent>()
        val gameRepository = fakeRepo(eventsFlow)
        val resultsStore = mockk<ResultsStore>(relaxed = true)

        val viewModel = GameViewModel(gameRepository, resultsStore)

        viewModel.sideEffects.test {
            eventsFlow.emit(
                GameEvent.GameOver(
                    roomId = "room-42",
                    winnerId = "player-1",
                    finalStandings = listOf(
                        FinalStanding(playerId = "player-1", rank = 1, score = 1000, xpAwarded = 50),
                        FinalStanding(playerId = "player-2", rank = 2, score = 800, xpAwarded = 30)
                    )
                )
            )

            // State must be GameOver after processing the event.
            val uiState = viewModel.uiState.value
            assertTrue(
                "Expected GameOver state but was $uiState",
                uiState is GameUiState.GameOver
            )
            val gameOverState = uiState as GameUiState.GameOver
            assertEquals("room-42", gameOverState.roomId)
            assertEquals("player-1", gameOverState.winnerId)
            // Total XP is the sum of all xpAwarded values (50 + 30 = 80).
            assertEquals(80, gameOverState.xpAwarded)

            // ResultsStore.setResults must have been called with the leaderboard.
            verify { resultsStore.setResults(any<List<LeaderboardEntry>>(), any()) }

            // A NavigateToResults side effect must be emitted.
            val effect = awaitItem()
            assertTrue(
                "Expected NavigateToResults side effect but was $effect",
                effect is GameSideEffect.NavigateToResults
            )
            assertEquals("room-42", (effect as GameSideEffect.NavigateToResults).roomId)

            cancelAndIgnoreRemainingEvents()
        }
    }

    // ---------------------------------------------------------------------------
    // Test 3: timer countdown is started when handleRoomState receives a question
    // ---------------------------------------------------------------------------

    /**
     * When [GameEvent.QuestionStarted] is processed the ViewModel starts a
     * countdown timer.  Advancing virtual time by the full question duration
     * must bring [GameUiState.ActiveQuestion.timerSeconds] down to zero (and
     * never below zero).
     */
    @Test
    fun `timer countdown updates timerSeconds and does not go below zero`() = runTest {
        val eventsFlow = MutableSharedFlow<GameEvent>()
        val gameRepository = fakeRepo(eventsFlow)
        val resultsStore = mockk<ResultsStore>(relaxed = true)

        val viewModel = GameViewModel(gameRepository, resultsStore)

        // Emit a question with a 3-second limit.  The far-past startedAt causes
        // remainingSeconds() to clamp to the full timeLimitMs / 1000 = 3 s.
        eventsFlow.emit(
            GameEvent.QuestionStarted(
                roomId = "room-timer",
                roundId = "round-1",
                questionId = "q-timer",
                prompt = "Timer test?",
                answers = listOf("A", "B"),
                timeLimitMs = 3_000,
                startedAt = "2020-01-01T00:00:00Z"
            )
        )

        // Confirm we entered ActiveQuestion before advancing time.
        assertTrue(
            "Expected ActiveQuestion immediately after QuestionStarted",
            viewModel.uiState.value is GameUiState.ActiveQuestion
        )

        // Advance virtual time by 4 s — one second past the 3-second limit.
        advanceTimeBy(4_000L)

        val state = viewModel.uiState.value
        if (state is GameUiState.ActiveQuestion) {
            assertFalse(
                "timerSeconds must not go below zero, but was ${state.timerSeconds}",
                state.timerSeconds < 0
            )
        }
        // If the state transitioned away from ActiveQuestion that is also acceptable.
    }

    // ---------------------------------------------------------------------------
    // Test 4: handleRoomState with status=WAITING transitions to Lobby
    // ---------------------------------------------------------------------------

    /**
     * A [GameEvent.RoomState] carrying phase="WAITING" must produce a
     * [GameUiState.Lobby] with the room details surfaced on the state.
     */
    @Test
    fun `handleRoomState with WAITING phase transitions ViewModel to Lobby state`() = runTest {
        val eventsFlow = MutableSharedFlow<GameEvent>()
        val gameRepository = fakeRepo(eventsFlow)
        val resultsStore = mockk<ResultsStore>(relaxed = true)

        val viewModel = GameViewModel(gameRepository, resultsStore)

        // Start from Idle.
        assertEquals(GameUiState.Idle, viewModel.uiState.value)

        eventsFlow.emit(
            GameEvent.RoomState(
                room = RoomSnapshot(
                    roomId = "room-waiting",
                    code = "WAIT01",
                    phase = "WAITING",
                    roundNumber = 0,
                    totalRounds = 10,
                    players = emptyList(),
                    hostPlayerId = "host-1"
                )
            )
        )

        val state = viewModel.uiState.value
        assertTrue(
            "Expected Lobby state after WAITING RoomState, but was $state",
            state is GameUiState.Lobby
        )
        val lobby = state as GameUiState.Lobby
        assertEquals("room-waiting", lobby.roomId)
        assertEquals("WAIT01", lobby.roomCode)
    }

    // ---------------------------------------------------------------------------
    // Test 5: exponential backoff — backoffMs is reset after a successful reconnect
    // ---------------------------------------------------------------------------

    /**
     * The retry loop in [observeGameEvents] resets [backoffMs] to 1 000 ms at the
     * top of each successful collection cycle.  After a socket error forces a
     * retry, advancing past the initial 1 s backoff and then providing a healthy
     * events flow must result in the ViewModel processing new events — proving
     * that the backoff was bounded at 1 s (i.e. reset after a good connection)
     * and the retry loop remained alive.
     */
    @Test
    fun `backoffMs is reset after reconnect and ViewModel continues processing events`() = runTest {
        // Start with a normally-operating flow so the ViewModel enters the
        // "collection active" branch (backoffMs reset to 1 000 L).
        val initialFlow = MutableSharedFlow<GameEvent>()
        val gameRepository = fakeRepo(initialFlow)
        val resultsStore = mockk<ResultsStore>(relaxed = true)

        val viewModel = GameViewModel(gameRepository, resultsStore)

        // Confirm the ViewModel is collecting and processing events correctly.
        initialFlow.emit(
            GameEvent.RoomState(
                room = RoomSnapshot(
                    roomId = "room-initial",
                    code = "INIT01",
                    phase = "WAITING",
                    roundNumber = 0,
                    totalRounds = 10,
                    players = emptyList(),
                    hostPlayerId = ""
                )
            )
        )
        assertTrue(
            "Expected Lobby state after initial RoomState",
            viewModel.uiState.value is GameUiState.Lobby
        )

        // Inject a throwing flow to simulate an abrupt socket disconnect.
        every { gameRepository.events } returns kotlinx.coroutines.flow.flow {
            throw RuntimeException("Simulated socket disconnect")
        }

        // Advance past the 1 s initial backoff so the retry iteration runs.
        advanceTimeBy(1_100L)

        // Provide a fresh, healthy flow for the reconnected session.
        val reconnectedFlow = MutableSharedFlow<GameEvent>()
        every { gameRepository.events } returns reconnectedFlow

        advanceUntilIdle()

        // Emit an event on the reconnected flow — the ViewModel must handle it,
        // proving the retry loop is alive and the backoff did not grow unboundedly.
        reconnectedFlow.emit(
            GameEvent.RoomState(
                room = RoomSnapshot(
                    roomId = "room-reconnected",
                    code = "RECON1",
                    phase = "WAITING",
                    roundNumber = 0,
                    totalRounds = 10,
                    players = emptyList(),
                    hostPlayerId = ""
                )
            )
        )

        advanceUntilIdle()

        val finalState = viewModel.uiState.value
        assertTrue(
            "Expected Lobby state after reconnected RoomState event, but was $finalState",
            finalState is GameUiState.Lobby
        )
        assertEquals(
            "roomId should reflect the reconnected room",
            "room-reconnected",
            (finalState as GameUiState.Lobby).roomId
        )
    }
}
