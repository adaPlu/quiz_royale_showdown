package com.quizroyale.showdown.data.game

import com.quizroyale.showdown.domain.model.GamePlayer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

data class RoomSnapshot(
  val roomId: String,
  val code: String,
  val phase: String,
  val roundNumber: Int,
  val totalRounds: Int,
  val players: List<GamePlayer>
)

data class ScoreRanking(
  val playerId: String,
  val scoreDelta: Int,
  val totalScore: Int
)

data class FinalStanding(
  val playerId: String,
  val rank: Int,
  val score: Int,
  val xpAwarded: Int
)

sealed interface GameEvent {
  data class RoomState(val room: RoomSnapshot) : GameEvent
  data class PlayerJoined(val roomId: String, val player: GamePlayer) : GameEvent
  data class PlayerLeft(val roomId: String, val playerId: String) : GameEvent
  data class CountdownStarted(val roomId: String, val startsAt: String, val seconds: Int) : GameEvent
  data class QuestionStarted(
    val roomId: String,
    val roundId: String,
    val questionId: String,
    val prompt: String,
    val answers: List<String>,
    val timeLimitMs: Int,
    val startedAt: String
  ) : GameEvent

  data class AnswerLocked(val roomId: String, val roundId: String, val lockedAt: String) : GameEvent
  data class RoundResult(
    val roomId: String,
    val roundId: String,
    val correctAnswerIndex: Int,
    val rankings: List<ScoreRanking>
  ) : GameEvent

  data class RoundElimination(
    val roomId: String,
    val eliminatedPlayerIds: List<String>,
    val survivors: List<GamePlayer>
  ) : GameEvent

  data class FinaleStarted(val roomId: String, val finalistIds: List<String>) : GameEvent
  data class GameOver(val roomId: String, val winnerId: String, val finalStandings: List<FinalStanding>) : GameEvent
  data class PowerupActivated(val roomId: String, val playerId: String, val powerupId: String) : GameEvent
  data class LootDrop(val powerupCode: String) : GameEvent
  data class ServerError(val message: String, val code: String? = null) : GameEvent
}

@Serializable
data class CreateRoomRequest(
  val isPrivate: Boolean = false,
  val maxPlayers: Int = 8
)

@Serializable
data class RoomResponse(
  val room: ApiRoom
)

@Serializable
data class ApiRoom(
  val id: String? = null,
  val roomId: String? = null,
  val code: String? = null,
  val roomCode: String? = null,
  val phase: String? = null,
  val status: String? = null,
  val roundNumber: Int = 0,
  val totalRounds: Int = 10,
  val players: List<ApiPlayer> = emptyList()
) {
  fun toDomain(): RoomSnapshot {
    val resolvedRoomId = roomId ?: id ?: code ?: roomCode.orEmpty()
    return RoomSnapshot(
      roomId = resolvedRoomId,
      code = code ?: roomCode ?: resolvedRoomId,
      phase = phase ?: status ?: "WAITING",
      roundNumber = roundNumber,
      totalRounds = totalRounds,
      players = players.map { it.toDomain() }
    )
  }
}

@Serializable
data class ApiPlayer(
  val id: String? = null,
  val playerId: String? = null,
  val displayName: String? = null,
  val username: String? = null,
  val avatarUrl: String? = null,
  val score: Int = 0,
  val streak: Int = 0,
  val isEliminated: Boolean = false
) {
  fun toDomain(): GamePlayer {
    val resolvedId = id ?: playerId.orEmpty()
    return GamePlayer(
      id = resolvedId,
      displayName = displayName ?: username ?: resolvedId.ifEmpty { "Player" },
      score = score,
      streak = streak,
      isEliminated = isEliminated,
      avatarUrl = avatarUrl
    )
  }
}

@Serializable
data class PowerupResponse(
  val id: String,
  @SerialName("code") val code: String? = null,
  val name: String? = null,
  val description: String? = null
)
