package com.quizroyale.showdown.ui.lobby

import androidx.lifecycle.SavedStateHandle
import app.cash.turbine.test
import com.quizroyale.showdown.data.auth.AuthRepository
import com.quizroyale.showdown.data.game.GameEvent
import com.quizroyale.showdown.data.game.GameRepository
import com.quizroyale.showdown.data.game.RoomSnapshot
import com.quizroyale.showdown.ui.game.MainDispatcherRule
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.net.UnknownHostException
import retrofit2.HttpException

@OptIn(ExperimentalCoroutinesApi::class)
class LobbyViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule(UnconfinedTestDispatcher())

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    private fun makeRoom(
        hostPlayerId: String,
        phase: String = "WAITING",
        roomId: String = "room-1"
    ) = RoomSnapshot(
        roomId = roomId,
        code = "CODE1",
        phase = phase,
        roundNumber = 0,
        totalRounds = 10,
        players = emptyList(),
        hostPlayerId = hostPlayerId
    )

    private fun buildViewModel(
        currentUserId: String,
        eventsFlow: MutableSharedFlow<GameEvent> = MutableSharedFlow(),
        initialRoomCode: String = ""
    ): LobbyViewModel {
        val authRepository = mockk<AuthRepository>()
        every { authRepository.currentUserId() } returns currentUserId

        val gameRepository = mockk<GameRepository>(relaxed = true)
        every { gameRepository.events } returns eventsFlow
        every { gameRepository.joinRoom(any()) } returns true

        val savedStateHandle = SavedStateHandle(
            if (initialRoomCode.isBlank()) emptyMap() else mapOf("roomId" to initialRoomCode)
        )

        return LobbyViewModel(gameRepository, authRepository, savedStateHandle)
    }

    /** Build a LobbyViewModel backed by a fully pre-configured [GameRepository] mock. */
    private fun buildViewModelWithRepo(
        currentUserId: String,
        gameRepository: GameRepository,
        initialRoomCode: String = "room-1"
    ): LobbyViewModel {
        val authRepository = mockk<AuthRepository>()
        every { authRepository.currentUserId() } returns currentUserId

        val savedStateHandle = SavedStateHandle(
            if (initialRoomCode.isBlank()) emptyMap() else mapOf("roomId" to initialRoomCode)
        )
        return LobbyViewModel(gameRepository, authRepository, savedStateHandle)
    }

    /** Minimal HttpException factory. */
    private fun httpException(code: Int): HttpException {
        val response = mockk<retrofit2.Response<*>> { every { code() } returns code }
        return HttpException(response)
    }

    // ---------------------------------------------------------------------------
    // 1. isHost is false when hostPlayerId differs from currentUserId
    // ---------------------------------------------------------------------------
    @Test
    fun `isHost is false when hostPlayerId differs from currentUserId`() = runTest {
        val eventsFlow = MutableSharedFlow<GameEvent>()
        val viewModel = buildViewModel(currentUserId = "user-A", eventsFlow = eventsFlow)

        eventsFlow.emit(GameEvent.RoomState(makeRoom(hostPlayerId = "user-B")))

        assertFalse(
            "isHost should be false when hostPlayerId != currentUserId",
            viewModel.uiState.value.isHost
        )
    }

    // ---------------------------------------------------------------------------
    // 2. isHost is true when hostPlayerId matches currentUserId
    // ---------------------------------------------------------------------------
    @Test
    fun `isHost is true when hostPlayerId matches currentUserId`() = runTest {
        val eventsFlow = MutableSharedFlow<GameEvent>()
        val viewModel = buildViewModel(currentUserId = "user-A", eventsFlow = eventsFlow)

        eventsFlow.emit(GameEvent.RoomState(makeRoom(hostPlayerId = "user-A")))

        assertTrue(
            "isHost should be true when hostPlayerId == currentUserId",
            viewModel.uiState.value.isHost
        )
    }

    // ---------------------------------------------------------------------------
    // 3. navigationEvents emits roomId when phase is not WAITING
    // ---------------------------------------------------------------------------
    @Test
    fun `navigationEvents emits roomId when phase is not WAITING`() = runTest {
        val eventsFlow = MutableSharedFlow<GameEvent>()
        val viewModel = buildViewModel(currentUserId = "user-A", eventsFlow = eventsFlow)

        viewModel.navigationEvents.test {
            eventsFlow.emit(
                GameEvent.RoomState(
                    makeRoom(hostPlayerId = "user-A", phase = "COUNTDOWN", roomId = "room-123")
                )
            )

            val emittedRoomId = awaitItem()
            assertEquals("room-123", emittedRoomId)

            cancelAndIgnoreRemainingEvents()
        }
    }

    // ---------------------------------------------------------------------------
    // 4. navigationEvents emits roomId when CountdownStarted event fires
    // ---------------------------------------------------------------------------
    @Test
    fun `navigationEvents emits roomId when CountdownStarted event fires`() = runTest {
        val eventsFlow = MutableSharedFlow<GameEvent>()
        val viewModel = buildViewModel(
            currentUserId = "user-A",
            eventsFlow = eventsFlow,
            initialRoomCode = "room-999"
        )

        val results = mutableListOf<String>()
        val job = launch { viewModel.navigationEvents.collect { results.add(it) } }

        eventsFlow.emit(
            GameEvent.CountdownStarted(
                roomId = "room-999",
                startsAt = "2026-01-01T00:00:00Z",
                seconds = 5
            )
        )

        advanceUntilIdle()

        assertEquals("Expected exactly one navigation event", 1, results.size)
        assertEquals("room-999", results[0])

        job.cancel()
    }

    // ---------------------------------------------------------------------------
    // 5. joinRoom returns false → error is "Sign in required before joining a room."
    // ---------------------------------------------------------------------------

    @Test
    fun `joinRoom sets error when repository returns false`() = runTest {
        val eventsFlow = MutableSharedFlow<GameEvent>()
        val gameRepository = mockk<GameRepository>(relaxed = true)
        every { gameRepository.events } returns eventsFlow
        every { gameRepository.joinRoom(any()) } returns false

        val viewModel = buildViewModelWithRepo(
            currentUserId = "user-A",
            gameRepository = gameRepository,
            initialRoomCode = ""
        )

        viewModel.onIntent(LobbyIntent.JoinRoom("ABCD1"))

        assertEquals(
            "Sign in required before joining a room.",
            viewModel.uiState.value.error
        )
    }

    // ---------------------------------------------------------------------------
    // 6. startGame 404 → error is "Not found."
    // ---------------------------------------------------------------------------

    @Test
    fun `startGame sets Not found error when repository throws HttpException 404`() = runTest {
        val eventsFlow = MutableSharedFlow<GameEvent>()
        val gameRepository = mockk<GameRepository>(relaxed = true)
        every { gameRepository.events } returns eventsFlow
        every { gameRepository.joinRoom(any()) } returns true
        coEvery { gameRepository.startRoom(any()) } throws httpException(404)

        val viewModel = buildViewModelWithRepo(
            currentUserId = "user-A",
            gameRepository = gameRepository,
            initialRoomCode = "room-1"
        )

        viewModel.onIntent(LobbyIntent.StartGame)
        advanceUntilIdle()

        assertEquals("Not found.", viewModel.uiState.value.error)
    }

    // ---------------------------------------------------------------------------
    // 7. startGame network error → error is "No internet connection."
    // ---------------------------------------------------------------------------

    @Test
    fun `startGame sets No internet connection error when repository throws UnknownHostException`() = runTest {
        val eventsFlow = MutableSharedFlow<GameEvent>()
        val gameRepository = mockk<GameRepository>(relaxed = true)
        every { gameRepository.events } returns eventsFlow
        every { gameRepository.joinRoom(any()) } returns true
        coEvery { gameRepository.startRoom(any()) } throws UnknownHostException("Host unreachable")

        val viewModel = buildViewModelWithRepo(
            currentUserId = "user-A",
            gameRepository = gameRepository,
            initialRoomCode = "room-1"
        )

        viewModel.onIntent(LobbyIntent.StartGame)
        advanceUntilIdle()

        assertEquals("No internet connection.", viewModel.uiState.value.error)
    }

    // ---------------------------------------------------------------------------
    // 8. startGame success → error is null
    // ---------------------------------------------------------------------------

    @Test
    fun `startGame clears error on success`() = runTest {
        val eventsFlow = MutableSharedFlow<GameEvent>()
        val gameRepository = mockk<GameRepository>(relaxed = true)
        every { gameRepository.events } returns eventsFlow
        every { gameRepository.joinRoom(any()) } returns true
        coEvery { gameRepository.startRoom(any()) } returns Unit

        val viewModel = buildViewModelWithRepo(
            currentUserId = "user-A",
            gameRepository = gameRepository,
            initialRoomCode = "room-1"
        )

        viewModel.onIntent(LobbyIntent.StartGame)
        advanceUntilIdle()

        assertNull(
            "error should be null after a successful startGame",
            viewModel.uiState.value.error
        )
    }

    // ---------------------------------------------------------------------------
    // 9. leaveRoom error → error is set via toUiMessage()
    // ---------------------------------------------------------------------------

    @Test
    fun `leaveRoom sets error via toUiMessage when repository throws`() = runTest {
        val eventsFlow = MutableSharedFlow<GameEvent>()
        val gameRepository = mockk<GameRepository>(relaxed = true)
        every { gameRepository.events } returns eventsFlow
        every { gameRepository.joinRoom(any()) } returns true
        coEvery { gameRepository.leaveRoom(any()) } throws httpException(500)

        val viewModel = buildViewModelWithRepo(
            currentUserId = "user-A",
            gameRepository = gameRepository,
            initialRoomCode = "room-1"
        )

        viewModel.onIntent(LobbyIntent.LeaveRoom)
        advanceUntilIdle()

        assertEquals(
            "Server error. Please try again later.",
            viewModel.uiState.value.error
        )
    }
}
