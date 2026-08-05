package com.quizroyale.showdown.data.room

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class GameDifficulty {
    @SerialName("easy")
    EASY,

    @SerialName("medium")
    MEDIUM,

    @SerialName("hard")
    HARD,
}

@Serializable
data class CreateRoomRequest(
    val isPrivate: Boolean,
    val maxPlayers: Int,
    val difficulty: GameDifficulty = GameDifficulty.MEDIUM,
    val autoStartSolo: Boolean = false,
)

@Serializable
data class JoinRoomRequest(
    val roomCode: String? = null,
)

@Serializable
data class StartGameRequest(
    val allowSolo: Boolean = false,
)

@Serializable
data class UpdateDifficultyRequest(
    val difficulty: GameDifficulty,
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
    val difficulty: GameDifficulty,
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
