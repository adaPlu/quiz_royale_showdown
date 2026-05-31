package com.quizroyale.showdown.data.socket

import app.cash.turbine.test
import com.quizroyale.showdown.ui.game.MainDispatcherRule
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Unit tests for [WebSocketManager] observable behavior.
 *
 * Socket.IO's [IO.socket] makes real network calls, so tests that exercise the
 * SharedFlow / StateFlow interfaces do so by accessing the private backing fields
 * via reflection. Tests that need to trigger socket callbacks (connect/disconnect)
 * are covered by calling [WebSocketManager.disconnect] directly, which is public
 * and sets _isConnected to false.
 *
 * Covered:
 *  1. Events flow — tryEmit on _events propagates to the public SharedFlow
 *  2. replay=1 — a new subscriber immediately receives the last emitted value
 *  3. isConnected state — starts false; reflects true after _isConnected update
 *  4. send() — does not throw when socket is null (disconnect / never connected)
 *  5. disconnect() — sets isConnected to false
 */
@OptIn(ExperimentalCoroutinesApi::class)
class WebSocketManagerTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule(UnconfinedTestDispatcher())

    // ---------------------------------------------------------------------------
    // Reflection helpers
    // ---------------------------------------------------------------------------

    /** Emit a value into WebSocketManager's private _events MutableSharedFlow. */
    private fun WebSocketManager.emitEvent(value: String) {
        val field = WebSocketManager::class.java.getDeclaredField("_events")
        field.isAccessible = true
        @Suppress("UNCHECKED_CAST")
        val flow = field.get(this) as MutableSharedFlow<String>
        flow.tryEmit(value)
    }

    /** Set WebSocketManager's private _isConnected MutableStateFlow. */
    private fun WebSocketManager.setConnected(value: Boolean) {
        val field = WebSocketManager::class.java.getDeclaredField("_isConnected")
        field.isAccessible = true
        @Suppress("UNCHECKED_CAST")
        val flow = field.get(this) as MutableStateFlow<Boolean>
        flow.value = value
    }

    // ---------------------------------------------------------------------------
    // 1. Events flow: tryEmit on _events propagates to the public SharedFlow
    // ---------------------------------------------------------------------------

    @Test
    fun `events flow emits value that was tryEmitted on _events`() = runTest {
        val manager = WebSocketManager()

        manager.events.test {
            manager.emitEvent("""{"type":"test","payload":"hello"}""")

            val received = awaitItem()
            assertEquals("""{"type":"test","payload":"hello"}""", received)

            cancelAndIgnoreRemainingEvents()
        }
    }

    // ---------------------------------------------------------------------------
    // 2. replay=1: a new collector receives the last emitted value immediately
    // ---------------------------------------------------------------------------

    @Test
    fun `events flow replay delivers last emitted value to a new subscriber`() = runTest {
        val manager = WebSocketManager()

        // Emit before any subscriber is attached
        manager.emitEvent("""{"type":"room:state","payload":"{}"}""")

        // New subscriber should get the replayed value without waiting
        manager.events.test {
            val replayed = awaitItem()
            assertEquals("""{"type":"room:state","payload":"{}"}""", replayed)

            cancelAndIgnoreRemainingEvents()
        }
    }

    // ---------------------------------------------------------------------------
    // 3. isConnected state: starts false; reflects true after _isConnected update
    // ---------------------------------------------------------------------------

    @Test
    fun `isConnected starts as false`() = runTest {
        val manager = WebSocketManager()

        assertFalse(
            "isConnected should start as false before any connect() call",
            manager.isConnected.value
        )
    }

    @Test
    fun `isConnected reflects true after _isConnected state is set`() = runTest {
        val manager = WebSocketManager()

        assertFalse(manager.isConnected.value)

        manager.setConnected(true)

        assertTrue(
            "isConnected should be true after _isConnected is set to true",
            manager.isConnected.value
        )
    }

    // ---------------------------------------------------------------------------
    // 4. send() does not throw when socket is null (never connected / disconnected)
    // ---------------------------------------------------------------------------

    @Test
    fun `send does not throw when socket is null`() = runTest {
        val manager = WebSocketManager()
        // socket is null by default (no connect() called)

        // Should complete without exception
        manager.send("""{"type":"answer","payload":"A"}""")

        // Reaching here means no exception was thrown — test passes
        assertTrue("send() must be a graceful no-op when socket is null", true)
    }

    // ---------------------------------------------------------------------------
    // 5. disconnect() sets isConnected to false
    // ---------------------------------------------------------------------------

    @Test
    fun `disconnect sets isConnected to false`() = runTest {
        val manager = WebSocketManager()

        // Simulate connected state via reflection
        manager.setConnected(true)
        assertTrue("Pre-condition: isConnected should be true", manager.isConnected.value)

        // disconnect() clears the state
        manager.disconnect()

        assertFalse(
            "isConnected should be false after disconnect()",
            manager.isConnected.value
        )
    }
}
