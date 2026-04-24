package com.quizroyale.showdown.data.socket

import io.socket.client.IO
import io.socket.client.Socket
import java.net.URI
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
data class SocketEnvelope(
  val type: String,
  val version: String,
  val payload: String
)

@Singleton
class WebSocketManager @Inject constructor(
) {
  private val _events = MutableSharedFlow<String>(extraBufferCapacity = 32)
  val events: SharedFlow<String> = _events

  private val _isConnected = MutableStateFlow(false)
  val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

  private var socket: Socket? = null
  private var latestUrl: String? = null
  private var latestAccessToken: String? = null

  fun connect(url: String, accessToken: String) {
    if (url == latestUrl && accessToken == latestAccessToken && socket?.connected() == true) {
      return
    }

    disconnect(clearLatest = false)
    latestUrl = url
    latestAccessToken = accessToken

    val options = IO.Options().apply {
      path = SOCKET_IO_PATH
      transports = arrayOf("websocket")
      reconnection = true
      reconnectionAttempts = Int.MAX_VALUE
      reconnectionDelay = 1_000
      reconnectionDelayMax = 16_000
      extraHeaders = mapOf("Authorization" to listOf("Bearer $accessToken"))
    }

    socket = IO.socket(socketIoBaseUrl(url), options).apply {
      on(Socket.EVENT_CONNECT) { _isConnected.value = true }
      on(Socket.EVENT_DISCONNECT) { _isConnected.value = false }
      on("message") { args ->
        args.firstOrNull()?.let { payload ->
          _events.tryEmit(payload.toString())
        }
      }
      on(Socket.EVENT_CONNECT_ERROR) { args ->
        _isConnected.value = false
        _events.tryEmit(errorEnvelope(args.firstOrNull()?.toString() ?: "Socket connection failed"))
      }
      on("error") { args ->
        _events.tryEmit(errorEnvelope(args.firstOrNull()?.toString() ?: "Socket error"))
      }
      connect()
    }
  }

  fun send(rawEnvelope: String) {
    val payload = runCatching { JSONObject(rawEnvelope) }.getOrElse { rawEnvelope }
    socket?.emit("message", payload)
  }

  fun disconnect() {
    disconnect(clearLatest = true)
  }

  private fun disconnect(clearLatest: Boolean) {
    socket?.off()
    socket?.disconnect()
    socket = null
    _isConnected.value = false
    if (clearLatest) {
      latestUrl = null
      latestAccessToken = null
    }
  }

  private fun socketIoBaseUrl(url: String): String {
    val uri = URI(url)
    val scheme = if (uri.scheme == "wss") "https" else "http"
    return URI(scheme, uri.userInfo, uri.host, uri.port, null, null, null).toString()
  }

  private fun errorEnvelope(message: String): String {
    return JSONObject()
      .put("type", "server:error")
      .put("version", "v1")
      .put("payload", JSONObject().put("message", message))
      .toString()
  }

  companion object {
    private const val SOCKET_IO_PATH = "/ws"
  }
}
