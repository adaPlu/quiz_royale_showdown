package com.quizroyale.showdown.ui.screens.profile

import app.cash.turbine.test
import com.quizroyale.showdown.data.auth.AuthRepository
import com.quizroyale.showdown.data.user.UserApi
import com.quizroyale.showdown.data.user.UserMeResponse
import com.quizroyale.showdown.ui.game.MainDispatcherRule
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.io.IOException
import java.net.UnknownHostException
import retrofit2.HttpException

/**
 * Unit tests for [ProfileViewModel].
 *
 * Three scenarios are covered:
 *  1. Successful API call → [ProfileUiState.Success] with the correct profile data.
 *  2. API throws [IOException] → [ProfileUiState.Error] with the expected message.
 *  3. "Null token" path — the ProfileViewModel delegates auth to the API layer
 *     (it injects [AuthRepository] but does not call it from [loadProfile]).
 *     We simulate the downstream auth failure by making [UserApi.getMe] throw a
 *     [RuntimeException] that represents an HTTP 401, and assert the ViewModel
 *     emits [ProfileUiState.Error].
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ProfileViewModelTest {

    // UnconfinedTestDispatcher makes viewModelScope.launch run eagerly so we
    // can observe state transitions without manually advancing the scheduler.
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule(UnconfinedTestDispatcher())

    // ---------------------------------------------------------------------------
    // Test 1: Successful load emits Success state with correct profile fields
    // ---------------------------------------------------------------------------

    @Test
    fun `loadProfile emits Success state when UserApi returns a valid profile`() = runTest {
        val userApi = mockk<UserApi>()
        val authRepository = mockk<AuthRepository>(relaxed = true)

        val expectedResponse = UserMeResponse(
            id = "user-1",
            email = "alice@example.com",
            displayName = "Alice",
            avatarUrl = "https://cdn.example.com/alice.png",
            totalXp = 500,
            level = 3,
            xpToNextLevel = 100,
            wins = 5,
            gamesPlayed = 20,
            mmr = 1200
        )
        coEvery { userApi.getMe() } returns expectedResponse

        val viewModel = ProfileViewModel(authRepository, userApi)

        viewModel.uiState.test {
            // Skip the initial Loading emission (emitted in init before getMe() returns).
            val loadingState = awaitItem()
            assertTrue(
                "Expected Loading as initial state but was $loadingState",
                loadingState is ProfileUiState.Loading
            )

            // Await the Success state produced after getMe() resolves.
            val successState = awaitItem()
            assertTrue(
                "Expected Success state but was $successState",
                successState is ProfileUiState.Success
            )

            val success = successState as ProfileUiState.Success
            assertEquals("Alice", success.displayName)
            assertEquals("https://cdn.example.com/alice.png", success.avatarUrl)
            assertEquals(3, success.level)
            assertEquals(500, success.xp)
            assertEquals(100, success.xpToNextLevel)
            assertEquals(5, success.wins)
            assertEquals(20, success.gamesPlayed)

            cancelAndIgnoreRemainingEvents()
        }
    }

    // ---------------------------------------------------------------------------
    // Test 2: API throws IOException → Error state with the standard message
    // ---------------------------------------------------------------------------

    @Test
    fun `loadProfile emits Error state with standard message when UserApi throws IOException`() = runTest {
        val userApi = mockk<UserApi>()
        val authRepository = mockk<AuthRepository>(relaxed = true)

        coEvery { userApi.getMe() } throws IOException("Network unavailable")

        val viewModel = ProfileViewModel(authRepository, userApi)

        viewModel.uiState.test {
            // Consume initial Loading.
            val loadingState = awaitItem()
            assertTrue(loadingState is ProfileUiState.Loading)

            // Error state must follow.
            val errorState = awaitItem()
            assertTrue(
                "Expected Error state after IOException but was $errorState",
                errorState is ProfileUiState.Error
            )
            assertEquals(
                "Unable to load profile. Please try again.",
                (errorState as ProfileUiState.Error).message
            )

            cancelAndIgnoreRemainingEvents()
        }
    }

    // ---------------------------------------------------------------------------
    // Test 3: Null-token / unauthenticated path
    //
    // ProfileViewModel injects AuthRepository but does not call it inside
    // loadProfile(); auth is enforced by the Retrofit OkHttp interceptor.
    // When no token is present the interceptor either drops the Authorization
    // header or the server replies 401 — either way the Retrofit call throws an
    // exception before a successful response is delivered.
    //
    // We simulate this by making UserApi.getMe() throw a RuntimeException that
    // models the HTTP 401 scenario and assert the ViewModel surfaces an Error
    // state rather than crashing or staying in Loading.
    // ---------------------------------------------------------------------------

    @Test
    fun `loadProfile emits Error state when authentication token is absent`() = runTest {
        val userApi = mockk<UserApi>()
        val authRepository = mockk<AuthRepository>(relaxed = true)

        // Simulate the auth-failure path: Retrofit / interceptor throws when
        // the token is null and the server returns a 401 Unauthorized response.
        coEvery { userApi.getMe() } throws RuntimeException("HTTP 401 Unauthorized")

        // Confirm authRepository.currentAccessToken() returning null is wired up
        // correctly on the mock (even though ProfileViewModel does not call it
        // directly — this guards against future refactors that add the check).
        every { authRepository.currentAccessToken() } returns null

        val viewModel = ProfileViewModel(authRepository, userApi)

        viewModel.uiState.test {
            // Consume Loading.
            val loadingState = awaitItem()
            assertTrue(loadingState is ProfileUiState.Loading)

            // The ViewModel must not stay in Loading or crash; it must emit Error.
            val errorState = awaitItem()
            assertTrue(
                "Expected Error state for unauthenticated path but was $errorState",
                errorState is ProfileUiState.Error
            )
            assertEquals(
                "Unable to load profile. Please try again.",
                (errorState as ProfileUiState.Error).message
            )

            cancelAndIgnoreRemainingEvents()
        }
    }

    // ---------------------------------------------------------------------------
    // Helper: build a minimal HttpException for a given HTTP status code
    // ---------------------------------------------------------------------------
    private fun httpException(code: Int): HttpException {
        val response = mockk<retrofit2.Response<*>> { every { code() } returns code }
        return HttpException(response)
    }

    // ---------------------------------------------------------------------------
    // Test 4 (QW-6 / S2-7): Network error → "No internet connection."
    // ---------------------------------------------------------------------------

    @Test
    fun `loadProfile emits No internet connection error when UnknownHostException is thrown`() = runTest {
        val userApi = mockk<UserApi>()
        val authRepository = mockk<AuthRepository>(relaxed = true)

        coEvery { userApi.getMe() } throws UnknownHostException("Unable to resolve host")

        val viewModel = ProfileViewModel(authRepository, userApi)

        viewModel.uiState.test {
            assertTrue("Initial state must be Loading", awaitItem() is ProfileUiState.Loading)

            val errorState = awaitItem()
            assertTrue("Expected Error after UnknownHostException", errorState is ProfileUiState.Error)
            assertEquals(
                "No internet connection.",
                (errorState as ProfileUiState.Error).message
            )

            cancelAndIgnoreRemainingEvents()
        }
    }

    // ---------------------------------------------------------------------------
    // Test 5: HTTP 404 → "Not found."
    // ---------------------------------------------------------------------------

    @Test
    fun `loadProfile emits Not found error when HttpException 404 is thrown`() = runTest {
        val userApi = mockk<UserApi>()
        val authRepository = mockk<AuthRepository>(relaxed = true)

        coEvery { userApi.getMe() } throws httpException(404)

        val viewModel = ProfileViewModel(authRepository, userApi)

        viewModel.uiState.test {
            assertTrue("Initial state must be Loading", awaitItem() is ProfileUiState.Loading)

            val errorState = awaitItem()
            assertTrue("Expected Error after 404", errorState is ProfileUiState.Error)
            assertEquals(
                "Not found.",
                (errorState as ProfileUiState.Error).message
            )

            cancelAndIgnoreRemainingEvents()
        }
    }

    // ---------------------------------------------------------------------------
    // Test 6: HTTP 500 → "Server error. Please try again later."
    // ---------------------------------------------------------------------------

    @Test
    fun `loadProfile emits Server error when HttpException 500 is thrown`() = runTest {
        val userApi = mockk<UserApi>()
        val authRepository = mockk<AuthRepository>(relaxed = true)

        coEvery { userApi.getMe() } throws httpException(500)

        val viewModel = ProfileViewModel(authRepository, userApi)

        viewModel.uiState.test {
            assertTrue("Initial state must be Loading", awaitItem() is ProfileUiState.Loading)

            val errorState = awaitItem()
            assertTrue("Expected Error after 500", errorState is ProfileUiState.Error)
            assertEquals(
                "Server error. Please try again later.",
                (errorState as ProfileUiState.Error).message
            )

            cancelAndIgnoreRemainingEvents()
        }
    }

    // ---------------------------------------------------------------------------
    // Test 7: Loading state is emitted before coroutines advance
    // ---------------------------------------------------------------------------

    @Test
    fun `loadProfile emits Loading state before the API call resolves`() = runTest {
        val userApi = mockk<UserApi>()
        val authRepository = mockk<AuthRepository>(relaxed = true)

        // Use coAnswers with a suspending delay so we can observe Loading before Success
        coEvery { userApi.getMe() } coAnswers {
            kotlinx.coroutines.delay(1_000)
            UserMeResponse(
                id = "u1",
                email = "test@example.com",
                displayName = "Tester",
                avatarUrl = null,
                totalXp = 0,
                level = 1,
                xpToNextLevel = 150,
                wins = 0,
                gamesPlayed = 0,
                mmr = 1000
            )
        }

        val viewModel = ProfileViewModel(authRepository, userApi)

        viewModel.uiState.test {
            // The very first state emission must be Loading
            val firstState = awaitItem()
            assertTrue(
                "Expected Loading as first state but was $firstState",
                firstState is ProfileUiState.Loading
            )

            cancelAndIgnoreRemainingEvents()
        }
    }
}
