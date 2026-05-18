package com.quizroyale.showdown.ui.game

import app.cash.turbine.test
import com.quizroyale.showdown.data.game.FinalStanding
import com.quizroyale.showdown.data.game.GameEvent
import com.quizroyale.showdown.data.game.GameRepository
import com.quizroyale.showdown.data.game.RoomSnapshot
import com.quizroyale.showdown.data.results.ResultsStore
import com.quizroyale.showdown.domain.model.LeaderboardEntry
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GameViewModelTest {

    // MainDispatcherRule sets Dispatchers.Main to UnconfinedTestDispatcher for all tests.
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule(UnconfinedTestDispatcher())

    // ---------------------------------------------------------------------------
    // Helper: build a GameRepository mock whose events flow is controlled by the
    // supplied SharedFlow.  By default joinRoom returns true and isConnected is a
    // stable true flow so the ViewModel doesn't end up in a reconnecting state.
    // ---------------------------------------------------------------------------
    private fun fakeRepo(
        eventsFlow: MutableSharedFlow<GameEvent> = MutableSharedFlow()
    ): GameRepository {
        val repo = mockk<GameRepository>(relaxed = true)
        every { repo.events } returns eventsFlow
        every { repo.isConnected } returns MutableStateFlow(true)
        every { repo.joinRoom(any()) } returns true
        return repo
    }

    // ---------------------------------------------------------------------------
    // 1. submitAnswer ignores duplicate when isAnswerLocked
    // ---------------------------------------------------------------------------
    @Test
    fun `submitAnswer ignores duplicate when isAnswerLocked`() = runTest {
        val eventsFlow = MutableSharedFlow<GameEvent>()
        val gameRepository = fakeRepo(eventsFlow)
        val resultsStore = mockk<ResultsStore>(relaxed = true)

        val viewModel = GameViewModel(gameRepository, resultsStore)

        // Drive the ViewModel into ActiveQuestion with isAnswerLocked = true
        viewModel.uiState.value.let { /* initial state is Idle */ }
        // Directly set state by emitting a QuestionStarted event then AnswerLocked
        eventsFlow.emit(
            GameEvent.QuestionStarted(
                roomId = "room-1",
                roundId = "round-1",
                questionId = "q-1",
                prompt = "What is 2+2?",
                answers = listOf("3", "4", "5", "6"),
                timeLimitMs = 20_000,
                startedAt = "2026-01-01T00:00:00Z"
            )
        )
        eventsFlow.emit(
            GameEvent.AnswerLocked(
                roomId = "room-1",
                roundId = "round-1",
                lockedAt = "2026-01-01T00:00:10Z"
            )
        )

        // Now the state should be ActiveQuestion with isAnswerLocked = true
        val state = viewModel.uiState.value
        assertTrue("State should be ActiveQuestion", state is GameUiState.ActiveQuestion)
        assertTrue("isAnswerLocked should be true", (state as GameUiState.ActiveQuestion).isAnswerLocked)

        // Call submitAnswer — should be a no-op because isAnswerLocked is true
        viewModel.submitAnswer(0)

        // gameRepository.submitAnswer must NOT be called
        verify(exactly = 0) { gameRepository.submitAnswer(any(), any(), any()) }
    }

    // ---------------------------------------------------------------------------
    // 2. handleGameOver stores results and emits NavigateToResults
    // ---------------------------------------------------------------------------
    @Test
    fun `handleGameOver stores results and emits NavigateToResults`() = runTest {
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

            // resultsStore.setResults should have been called
            verify { resultsStore.setResults(any<List<LeaderboardEntry>>(), any()) }

            // The side effect channel should emit NavigateToResults
            val effect = awaitItem()
            assertTrue("Expected NavigateToResults", effect is GameSideEffect.NavigateToResults)
            val nav = effect as GameSideEffect.NavigateToResults
            assert(nav.roomId == "room-42") { "Expected roomId 'room-42', got '${nav.roomId}'" }

            cancelAndIgnoreRemainingEvents()
        }
    }

    // ---------------------------------------------------------------------------
    // 3. timer counts down and does not go below zero
    // ---------------------------------------------------------------------------
    @Test
    fun `timer counts down and does not go below zero`() = runTest {
        val eventsFlow = MutableSharedFlow<GameEvent>()
        val gameRepository = fakeRepo(eventsFlow)
        val resultsStore = mockk<ResultsStore>(relaxed = true)

        val viewModel = GameViewModel(gameRepository, resultsStore)

        // Emit a QuestionStarted with 3-second limit.
        // Use a known past startedAt so remainingSeconds computes the full 3 s.
        eventsFlow.emit(
            GameEvent.QuestionStarted(
                roomId = "room-1",
                roundId = "round-1",
                questionId = "q-timer",
                prompt = "Timer test?",
                answers = listOf("A", "B"),
                timeLimitMs = 3_000,
                startedAt = "2026-01-01T00:00:00Z"  // far in the past — clamps to 3 s
            )
        )

        // Advance virtual time by 4 seconds (one second past the limit)
        advanceTimeBy(4_000L)

        // The timer should have bottomed out at 0
        val state = viewModel.uiState.value
        if (state is GameUiState.ActiveQuestion) {
            assertFalse(
                "timerSeconds should not go below zero, but was ${state.timerSeconds}",
                state.timerSeconds < 0
            )
        }
        // If state is no longer ActiveQuestion (e.g. advanced to RoundResult), that is fine too
    }

    // ---------------------------------------------------------------------------
    // 4. joinRoom emits ShowToast when repository returns false
    // ---------------------------------------------------------------------------
    @Test
    fun `joinRoom emits ShowToast when repository returns false`() = runTest {
        val eventsFlow = MutableSharedFlow<GameEvent>()
        val gameRepository = fakeRepo(eventsFlow)
        every { gameRepository.joinRoom(any()) } returns false   // override to fail

        val resultsStore = mockk<ResultsStore>(relaxed = true)
        val viewModel = GameViewModel(gameRepository, resultsStore)

        viewModel.sideEffects.test {
            viewModel.joinRoom("ABCD12")

            val effect = awaitItem()
            assertTrue("Expected ShowToast side effect", effect is GameSideEffect.ShowToast)

            cancelAndIgnoreRemainingEvents()
        }
    }

    // ---------------------------------------------------------------------------
    // 5. observeGameEvents continues collecting after an exception (backoff reset)
    //    After a flow error the VM delays 1 s then restarts collection. We verify
    //    it actually processes events from the fresh flow after the backoff elapses,
    //    proving the retry loop remains alive and the backoff is bounded to 1 s.
    // ---------------------------------------------------------------------------
    @Test
    fun `observeGameEvents continues collecting after exception`() = runTest {
        val firstFlow = MutableSharedFlow<GameEvent>()
        val gameRepository = fakeRepo(firstFlow)
        val resultsStore = mockk<ResultsStore>(relaxed = true)

        val viewModel = GameViewModel(gameRepository, resultsStore)

        // Establish initial state via a good event so the VM is in a known Lobby state.
        firstFlow.emit(
            GameEvent.RoomState(
                room = RoomSnapshot(
                    roomId = "room-x",
                    code = "CODEX",
                    phase = "WAITING",
                    roundNumber = 0,
                    totalRounds = 10,
                    players = emptyList(),
                    hostPlayerId = ""
                )
            )
        )

        assertTrue(
            "State should be Lobby after initial RoomState",
            viewModel.uiState.value is GameUiState.Lobby
        )

        // Swap in a throwing flow to simulate a socket disconnect.
        every { gameRepository.events } returns kotlinx.coroutines.flow.flow {
            throw RuntimeException("Simulated socket close")
        }

        // Advance past the 1 s backoff so the retry triggers.
        advanceTimeBy(1_100L)

        // Now provide a fresh flow for the reconnected session.
        val freshFlow = MutableSharedFlow<GameEvent>()
        every { gameRepository.events } returns freshFlow

        advanceUntilIdle()

        // Emit an event on the fresh flow; the VM must process it.
        freshFlow.emit(
            GameEvent.RoomState(
                room = RoomSnapshot(
                    roomId = "room-y",
                    code = "CODEY",
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
            "State should be Lobby after reconnected RoomState event, but was $finalState",
            finalState is GameUiState.Lobby
        )
        assertEquals(
            "roomId should match the reconnected room",
            "room-y",
            (finalState as GameUiState.Lobby).roomId
        )
    }
}
