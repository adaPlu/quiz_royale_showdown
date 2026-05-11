package com.quizroyale.showdown.ui.screens.leaderboard

import app.cash.turbine.test
import com.quizroyale.showdown.data.auth.AuthRepository
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

    private val authRepository = mockk<AuthRepository>()
    private val leaderboardApi = mockk<LeaderboardApi>()

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initial state is loading`() {
        // Prevent the init loadTab from completing by making token call hang isn't needed;
        // we just need to observe the state before any coroutines are advanced.
        every { authRepository.currentAccessToken() } returns null

        val viewModel = LeaderboardViewModel(authRepository, leaderboardApi)
        // Before advancing the dispatcher the state should be loading=true
        assertTrue(viewModel.uiState.value.loading)
    }

    @Test
    fun `loadTab returns empty list when token is null`() = runTest {
        every { authRepository.currentAccessToken() } returns null

        val viewModel = LeaderboardViewModel(authRepository, leaderboardApi)

        viewModel.uiState.test {
            // Consume the initial loading=true emission
            val initialState = awaitItem()
            assertTrue(initialState.loading)

            // Advance so coroutines run
            testScheduler.advanceUntilIdle()

            // After coroutines run, loading should be false and entries empty
            val finalState = awaitItem()
            assertFalse(finalState.loading)
            assertTrue(finalState.entries.isEmpty())

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `loadTab populates entries on successful API response`() = runTest {
        val token = "test-token"
        every { authRepository.currentAccessToken() } returns token

        val fakeRows = listOf(
            LeaderboardRow(
                userId = "user1",
                displayName = "Alice",
                mmr = 1500,
                totalXp = 3000,
                level = 10
            ),
            LeaderboardRow(
                userId = "user2",
                displayName = "Bob",
                mmr = 900,
                totalXp = 9000,
                level = 5
            )
        )
        coEvery { leaderboardApi.getSeason("Bearer $token") } returns fakeRows

        val viewModel = LeaderboardViewModel(authRepository, leaderboardApi)

        viewModel.uiState.test {
            // Consume initial loading state
            awaitItem()

            // Run coroutines
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
}
