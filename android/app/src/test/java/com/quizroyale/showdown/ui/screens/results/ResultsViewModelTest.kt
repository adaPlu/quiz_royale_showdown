package com.quizroyale.showdown.ui.screens.results

import app.cash.turbine.test
import com.quizroyale.showdown.data.auth.AuthRepository
import com.quizroyale.showdown.data.results.ResultsData
import com.quizroyale.showdown.data.results.ResultsStore
import com.quizroyale.showdown.domain.model.LeaderboardEntry
import com.quizroyale.showdown.ui.game.MainDispatcherRule
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ResultsViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule(UnconfinedTestDispatcher())

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    private val resultsFlow = MutableStateFlow<ResultsData?>(null)

    private fun makeAuthRepository(userId: String = "user-1"): AuthRepository =
        mockk(relaxed = true) {
            every { currentUserId() } returns userId
        }

    private fun makeResultsStore(): ResultsStore =
        mockk(relaxed = true) {
            every { results } returns resultsFlow
        }

    private fun makeViewModel(
        auth: AuthRepository = makeAuthRepository(),
        store: ResultsStore = makeResultsStore()
    ): ResultsViewModel = ResultsViewModel(auth, store)

    private fun fakeStandings(count: Int): List<LeaderboardEntry> =
        (1..count).map { rank ->
            LeaderboardEntry(
                rank = rank,
                playerId = "player-$rank",
                displayName = "Player $rank",
                score = (count - rank + 1) * 100,
                correctAnswers = 5,
                totalAnswers = 10
            )
        }

    // ---------------------------------------------------------------------------
    // 1. Initial state
    // ---------------------------------------------------------------------------
    @Test
    fun `initial state has empty leaderboard and null winner`() {
        val viewModel = makeViewModel()

        val state = viewModel.uiState.value
        assertTrue("Initial leaderboard should be empty", state.leaderboard.isEmpty())
        assertNull("Initial winner should be null", state.winner)
        assertNull("Initial xpEarned should be null", state.xpEarned)
    }

    @Test
    fun `initial state captures currentUserId from authRepository`() {
        val viewModel = makeViewModel(auth = makeAuthRepository(userId = "user-42"))

        assertEquals("user-42", viewModel.uiState.value.currentUserId)
    }

    // ---------------------------------------------------------------------------
    // 2. Loads results from ResultsStore when data is emitted
    // ---------------------------------------------------------------------------
    @Test
    fun `emitting results to store updates uiState leaderboard and xpEarned`() = runTest {
        val viewModel = makeViewModel()
        val standings = fakeStandings(3)

        viewModel.uiState.test {
            awaitItem() // initial state

            resultsFlow.value = ResultsData(leaderboard = standings, xpEarned = 250)

            val updated = awaitItem()
            assertEquals(3, updated.leaderboard.size)
            assertEquals(250, updated.xpEarned)

            cancelAndIgnoreRemainingEvents()
        }
    }

    // ---------------------------------------------------------------------------
    // 3. Empty final standings — no crash, winner is null
    // ---------------------------------------------------------------------------
    @Test
    fun `empty leaderboard from store results in null winner`() = runTest {
        val viewModel = makeViewModel()

        viewModel.uiState.test {
            awaitItem() // initial state

            resultsFlow.value = ResultsData(leaderboard = emptyList(), xpEarned = 0)

            val updated = awaitItem()
            assertTrue("Leaderboard should be empty", updated.leaderboard.isEmpty())
            assertNull("Winner should be null when leaderboard is empty", updated.winner)

            cancelAndIgnoreRemainingEvents()
        }
    }

    // ---------------------------------------------------------------------------
    // 4. Non-empty standings — winner is first entry (rank 1)
    // ---------------------------------------------------------------------------
    @Test
    fun `non-empty standings exposes winner as first leaderboard entry`() = runTest {
        val viewModel = makeViewModel()
        val standings = fakeStandings(3)

        viewModel.uiState.test {
            awaitItem() // initial state

            resultsFlow.value = ResultsData(leaderboard = standings, xpEarned = 100)

            val updated = awaitItem()
            assertEquals(3, updated.leaderboard.size)
            val winner = updated.winner
            assertTrue("Winner should not be null", winner != null)
            assertEquals(1, winner!!.rank)
            assertEquals("Player 1", winner.displayName)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `standings with 3 players are exposed in rank order`() = runTest {
        val viewModel = makeViewModel()
        val standings = fakeStandings(3)

        viewModel.uiState.test {
            awaitItem() // initial state

            resultsFlow.value = ResultsData(leaderboard = standings, xpEarned = 75)

            val updated = awaitItem()
            assertEquals(1, updated.leaderboard[0].rank)
            assertEquals(2, updated.leaderboard[1].rank)
            assertEquals(3, updated.leaderboard[2].rank)

            cancelAndIgnoreRemainingEvents()
        }
    }

    // ---------------------------------------------------------------------------
    // 5. clearResults delegates to ResultsStore.clear()
    // ---------------------------------------------------------------------------
    @Test
    fun `clearResults delegates to resultsStore clear`() {
        val store = makeResultsStore()
        val viewModel = makeViewModel(store = store)

        viewModel.clearResults()

        verify { store.clear() }
    }

    // ---------------------------------------------------------------------------
    // 6. setResults delegates to resultsStore setResults
    // ---------------------------------------------------------------------------
    @Test
    fun `setResults delegates to resultsStore setResults with correct args`() {
        val store = makeResultsStore()
        val viewModel = makeViewModel(store = store)
        val standings = fakeStandings(2)

        viewModel.setResults(standings, 500)

        verify { store.setResults(standings, 500) }
    }
}
