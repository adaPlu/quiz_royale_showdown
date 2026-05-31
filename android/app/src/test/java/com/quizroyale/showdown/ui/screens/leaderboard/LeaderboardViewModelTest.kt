package com.quizroyale.showdown.ui.screens.leaderboard

import app.cash.turbine.test
import io.mockk.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LeaderboardViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private val leaderboardApi = mockk<LeaderboardApi>()

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val fakeRows = listOf(
        LeaderboardRow(userId = "user1", displayName = "Alice", mmr = 1500, totalXp = 3000, level = 10),
        LeaderboardRow(userId = "user2", displayName = "Bob", mmr = 900, totalXp = 9000, level = 5),
    )

    @Test
    fun `initial state is loading`() {
        coEvery { leaderboardApi.getSeason() } coAnswers { kotlinx.coroutines.delay(Long.MAX_VALUE); emptyList() }
        val viewModel = LeaderboardViewModel(leaderboardApi)
        assertTrue(viewModel.uiState.value.loading)
    }

    @Test
    fun `loadTab populates entries on successful API response`() = runTest {
        coEvery { leaderboardApi.getSeason() } returns fakeRows

        val viewModel = LeaderboardViewModel(leaderboardApi)

        viewModel.uiState.test {
            awaitItem() // initial loading=true

            testScheduler.advanceUntilIdle()

            val finalState = awaitItem()
            assertFalse(finalState.loading)
            assertEquals(2, finalState.entries.size)
            assertEquals("Alice", finalState.entries[0].displayName)
            assertEquals("1500 MMR", finalState.entries[0].scoreLabel)
            assertEquals("Bob", finalState.entries[1].displayName)
            assertEquals("900 MMR", finalState.entries[1].scoreLabel)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `loadTab shows error when API throws`() = runTest {
        coEvery { leaderboardApi.getSeason() } throws RuntimeException("Network error")

        val viewModel = LeaderboardViewModel(leaderboardApi)

        viewModel.uiState.test {
            awaitItem() // initial loading=true

            testScheduler.advanceUntilIdle()

            val finalState = awaitItem()
            assertFalse(finalState.loading)
            assertTrue(finalState.entries.isEmpty())
            assertNotNull(finalState.error)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `setTab switches active tab and reloads data`() = runTest {
        coEvery { leaderboardApi.getSeason() } returns fakeRows
        coEvery { leaderboardApi.getGlobal() } returns listOf(
            LeaderboardRow(userId = "user3", displayName = "Carol", mmr = 2000, totalXp = 5000, level = 15)
        )

        val viewModel = LeaderboardViewModel(leaderboardApi)
        testScheduler.advanceUntilIdle()

        viewModel.setTab(LeaderboardTab.Global)
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(LeaderboardTab.Global, state.activeTab)
        assertEquals(1, state.entries.size)
        assertEquals("Carol", state.entries[0].displayName)
    }
}
