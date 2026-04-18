package com.quizroyale.showdown.data.remote.model

import kotlinx.serialization.Serializable

@Serializable
data class WsEnvelope(
    val eventType: String,
    val roomId: String,
    val senderId: String,
    val ts: Long,
    val payload: String,
)
