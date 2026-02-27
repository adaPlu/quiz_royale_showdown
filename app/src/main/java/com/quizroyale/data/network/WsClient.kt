package com.quizroyale.data.network

import okhttp3.*
import okio.ByteString
import java.util.concurrent.TimeUnit

class WsClient(
  private val url: String,
  private val onOpen: () -> Unit,
  private val onText: (String) -> Unit,
  private val onClosed: () -> Unit,
  private val onFailure: (Throwable) -> Unit
) {
  private val client = OkHttpClient.Builder()
    .readTimeout(0, TimeUnit.MILLISECONDS)
    .build()

  private var ws: WebSocket? = null

  fun connect() {
    val req = Request.Builder().url(url).build()
    ws = client.newWebSocket(req, object : WebSocketListener() {
      override fun onOpen(webSocket: WebSocket, response: Response) = onOpen()
      override fun onMessage(webSocket: WebSocket, text: String) = onText(text)
      override fun onMessage(webSocket: WebSocket, bytes: ByteString) = onText(bytes.utf8())
      override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = onClosed()
      override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = onFailure(t)
    })
  }

  fun send(json: String) { ws?.send(json) }
  fun close() { ws?.close(1000, "bye") }
}