package com.quizroyale.showdown.data.room

import kotlinx.serialization.Serializable

@Serializable
data class CreateRoomRequest(
    val isPrivate: Boolean,
    val maxPlayers: Int,
)

@Serializable
data class JoinRoomRequest(
    val roomCode: String? = null,
)

data class RoomPlayerSummary(
    val id: String,
    val displayName: String,
    val score: Int,
    val streak: Int,
    val isEliminated: Boolean,
)

data class RoomSnapshot(
    val roomId: String,
    val roomReference: String,
    val roomCode: String?,
    val phase: String,
    val roundNumber: Int,
    val totalRounds: Int,
    val totalPlayers: Int,
    val maxPlayers: Int?,
    val players: List<RoomPlayerSummary>,
    val hostUserId: String?,
    val wsToken: String?,
)

data class CachedRoomSummary(
    val roomId: String,
    val roomReference: String,
    val phase: String,
    val roundNumber: Int,
    val totalRounds: Int,
    val cachedAt: Long,
)
