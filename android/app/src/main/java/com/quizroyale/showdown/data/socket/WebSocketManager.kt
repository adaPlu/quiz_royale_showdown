package com.quizroyale.showdown.data.socket

import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WebSocketManager @Inject constructor() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _events = MutableSharedFlow<String>(extraBufferCapacity = 32)
    val events: SharedFlow<String> = _events

    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private var socket: Socket? = null

    fun connect(url: String, accessToken: String) {
        // Disconnect any existing socket before creating a new one
        socket?.let {
            it.off()
            it.disconnect()
        }

        val options = IO.Options().apply {
            path = "/ws"
            transports = arrayOf("websocket")
            auth = mapOf("token" to accessToken)
        }

        // Strip trailing path from url so IO.socket gets just scheme+host+port
        val baseUrl = url
            .replace(Regex("/ws$"), "")
            .replace(Regex("^ws://"), "http://")
            .replace(Regex("^wss://"), "https://")

        val newSocket = IO.socket(baseUrl, options)

        newSocket.on(Socket.EVENT_CONNECT) {
            _isConnected.value = true
        }

        newSocket.on(Socket.EVENT_DISCONNECT) {
            _isConnected.value = false
        }

        newSocket.on(Socket.EVENT_CONNECT_ERROR) {
            _isConnected.value = false
        }

        newSocket.on("message") { args ->
            val data = args.getOrNull(0)
            val json: String? = when (data) {
                is JSONObject -> data.toString()
                is String -> data
                else -> data?.toString()
            }
            if (json != null) {
                scope.launch { _events.emit(json) }
            }
        }

        socket = newSocket
        newSocket.connect()
    }

    fun send(rawEnvelope: String) {
        socket?.emit("message", JSONObject(rawEnvelope))
    }

    fun disconnect() {
        _isConnected.value = false
        socket?.off()
        socket?.disconnect()
        socket = null
    }
}
