package com.quizroyale.showdown.data.socket

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
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
  private val okHttpClient: OkHttpClient,
  private val json: Json,
  private val dispatcher: CoroutineDispatcher = Dispatchers.IO
) {
  private val scope = CoroutineScope(SupervisorJob() + dispatcher)
  private val _events = MutableSharedFlow<String>(extraBufferCapacity = 32)
  val events: SharedFlow<String> = _events

  private var webSocket: WebSocket? = null
  private var reconnectAttempt = 0
  private var latestUrl: String? = null
  private var latestAccessToken: String? = null

  fun connect(url: String, accessToken: String) {
    latestUrl = url
    latestAccessToken = accessToken
    val request = Request.Builder()
      .url(url)
      .header("Authorization", "Bearer $accessToken")
      .build()

    webSocket = okHttpClient.newWebSocket(request, listener)
  }

  fun send(rawEnvelope: String) {
    webSocket?.send(rawEnvelope)
  }

  fun disconnect() {
    latestUrl = null
    latestAccessToken = null
    webSocket?.close(1000, "client_disconnect")
    webSocket = null
  }

  private val listener = object : WebSocketListener() {
    override fun onMessage(webSocket: WebSocket, text: String) {
      reconnectAttempt = 0
      _events.tryEmit(text)
    }

    override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
      scheduleReconnect()
    }

    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
      scheduleReconnect()
    }
  }

  private fun scheduleReconnect() {
    val url = latestUrl ?: return
    val accessToken = latestAccessToken ?: return
    val delayMs = (1_000L * (1 shl reconnectAttempt.coerceAtMost(4))).coerceAtMost(16_000L)
    reconnectAttempt += 1
    scope.launch {
      delay(delayMs)
      connect(url, accessToken)
    }
  }
}
