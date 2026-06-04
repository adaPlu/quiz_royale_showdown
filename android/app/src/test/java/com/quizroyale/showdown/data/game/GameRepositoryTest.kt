package com.quizroyale.showdown.data.game

import app.cash.turbine.test
import com.quizroyale.showdown.data.auth.AuthRepository
import com.quizroyale.showdown.data.local.AppDatabase
import com.quizroyale.showdown.data.local.CachedPlayerDao
import com.quizroyale.showdown.data.local.CachedRoomSnapshotDao
import com.quizroyale.showdown.data.socket.WebSocketManager
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GameRepositoryTest {

    private val rawEvents = MutableSharedFlow<String>(replay = 1, extraBufferCapacity = 16)
    private lateinit var webSocketManager: WebSocketManager
    private lateinit var authRepository: AuthRepository
    private lateinit var gameApi: GameApi
    private lateinit var database: AppDatabase
    private lateinit var repository: GameRepository

    @Before
    fun setUp() {
        webSocketManager = mockk(relaxed = true) {
            every { events } returns rawEvents
            every { isConnected } returns MutableStateFlow(false)
        }
        authRepository = mockk(relaxed = true) {
            every { currentAccessToken() } returns "tok-123"
        }
        gameApi = mockk(relaxed = true)
        val roomDao = mockk<CachedRoomSnapshotDao>(relaxed = true)
        val playerDao = mockk<CachedPlayerDao>(relaxed = true)
        database = mockk(relaxed = true) {
            every { cachedRoomDao() } returns roomDao
            every { cachedPlayerDao() } returns playerDao
        }
        repository = GameRepository(gameApi, authRepository, webSocketManager, database)
    }

    @Test
    fun `parseEvent with valid room state sync emits RoomState`() = runTest {
        val json = """
            {
              "type": "room:state_sync",
              "version": "v1",
              "payload": {
                "room": {
                  "roomId": "room-1",
                  "code": "ABC123",
                  "phase": "WAITING",
                  "roundNumber": 0,
                  "totalRounds": 10,
                  "players": [],
                  "hostId": "host-1"
                }
              }
            }
        """.trimIndent()

        repository.events.test {
            rawEvents.emit(json)
            val event = awaitItem()
            assertTrue(event is GameEvent.RoomState)
            val roomState = event as GameEvent.RoomState
            assertTrue(roomState.snapshot.roomId == "room-1")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `parseEvent with malformed JSON logs error and does not emit`() = runTest {
        val malformed = "not-valid-json{{{{"

        repository.events.test {
            rawEvents.emit(malformed)
            // Should not emit anything — malformed JSON is swallowed
            expectNoEvents()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `parseEvent with unknown event type returns null and does not emit`() = runTest {
        val unknown = """
            {
              "type": "unknown:event_type_xyz",
              "version": "v1",
              "payload": {}
            }
        """.trimIndent()

        repository.events.test {
            rawEvents.emit(unknown)
            expectNoEvents()
            cancelAndIgnoreRemainingEvents()
        }
    }

    // ---------------------------------------------------------------------------
    // joinRoom — authenticated
    // ---------------------------------------------------------------------------
    @Test
    fun `joinRoom when authenticated sends room join envelope and returns true`() {
        every { authRepository.currentAccessToken() } returns "tok-abc"

        val result = repository.joinRoom("ABC123")

        assertTrue(result)
        verify {
            webSocketManager.send(match { msg ->
                msg.contains("\"type\":\"room:join\"") && msg.contains("\"roomCode\":\"ABC123\"")
            })
        }
    }

    // ---------------------------------------------------------------------------
    // joinRoom — unauthenticated
    // ---------------------------------------------------------------------------
    @Test
    fun `joinRoom when unauthenticated does not send and returns false`() {
        every { authRepository.currentAccessToken() } returns null

        val result = repository.joinRoom("ABC123")

        assertFalse(result)
        verify(exactly = 0) { webSocketManager.send(any()) }
    }

    // ---------------------------------------------------------------------------
    // leaveRoom — calls API and disconnects
    // ---------------------------------------------------------------------------
    @Test
    fun `leaveRoom calls gameApi leaveRoom and webSocketManager disconnect`() = runTest {
        repository.leaveRoom("room-1")

        coVerify { gameApi.leaveRoom("room-1") }
        verify { webSocketManager.disconnect() }
    }

    // ---------------------------------------------------------------------------
    // submitAnswer — correct envelope
    // ---------------------------------------------------------------------------
    @Test
    fun `submitAnswer sends correct envelope with all fields`() {
        repository.submitAnswer("room-1", "q-1", 2)

        verify {
            webSocketManager.send(match { msg ->
                msg.contains("\"type\":\"round:submit_answer\"") &&
                    msg.contains("\"roomId\":\"room-1\"") &&
                    msg.contains("\"questionId\":\"q-1\"") &&
                    msg.contains("\"answerIndex\":2")
            })
        }
    }

    // ---------------------------------------------------------------------------
    // sendHeartbeat — correct envelope
    // ---------------------------------------------------------------------------
    @Test
    fun `sendHeartbeat sends heartbeat envelope with type and roomId`() {
        repository.sendHeartbeat("room-1")

        verify {
            webSocketManager.send(match { msg ->
                msg.contains("\"type\":\"client:heartbeat\"") &&
                    msg.contains("\"roomId\":\"room-1\"")
            })
        }
    }

    @Test
    fun `parseEvent with question_started emits QuestionStarted`() = runTest {
        val json = """
            {
              "type": "round:question_started",
              "version": "v1",
              "payload": {
                "roomId": "room-1",
                "roundId": "round-1",
                "questionId": "q-1",
                "prompt": "What is 2+2?",
                "answers": ["3", "4", "5", "6"],
                "timeLimitMs": 20000,
                "startedAt": "2026-01-01T00:00:00Z"
              }
            }
        """.trimIndent()

        repository.events.test {
            rawEvents.emit(json)
            val event = awaitItem()
            assertTrue(event is GameEvent.QuestionStarted)
            val q = event as GameEvent.QuestionStarted
            assertTrue(q.prompt == "What is 2+2?")
            cancelAndIgnoreRemainingEvents()
        }
    }
}
