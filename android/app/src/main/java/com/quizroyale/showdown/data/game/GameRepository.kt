package com.quizroyale.showdown.data.game

import com.quizroyale.showdown.BuildConfig
import com.quizroyale.showdown.data.auth.AuthRepository
import com.quizroyale.showdown.data.local.AppDatabase
import com.quizroyale.showdown.data.local.CachedPlayerEntity
import com.quizroyale.showdown.data.local.CachedRoomSnapshotEntity
import com.quizroyale.showdown.data.socket.WebSocketManager
import com.quizroyale.showdown.domain.model.GamePlayer
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.mapNotNull
import org.json.JSONArray
import org.json.JSONObject

@Singleton
class GameRepository @Inject constructor(
  private val gameApi: GameApi,
  private val authRepository: AuthRepository,
  private val webSocketManager: WebSocketManager,
  private val database: AppDatabase
) {
  val events: Flow<GameEvent> = webSocketManager.events.mapNotNull(::parseEvent)

  suspend fun createRoom(isPrivate: Boolean = false, maxPlayers: Int = 8): RoomSnapshot {
    val snapshot = gameApi.createRoom(CreateRoomRequest(isPrivate, maxPlayers)).room.toDomain()
    cacheRoom(snapshot)
    return snapshot
  }

  suspend fun getRoom(roomCode: String): RoomSnapshot {
    val snapshot = gameApi.getRoom(roomCode).room.toDomain()
    cacheRoom(snapshot)
    return snapshot
  }

  fun joinRoom(roomCode: String): Boolean {
    if (!connectIfAuthenticated()) {
      return false
    }
    webSocketManager.send(
      envelope(
        type = "room:join",
        payload = JSONObject().put("roomCode", roomCode)
      )
    )
    return true
  }

  suspend fun startRoom(roomId: String) {
    gameApi.startRoom(roomId)
  }

  suspend fun leaveRoom(roomId: String) {
    gameApi.leaveRoom(roomId)
    webSocketManager.disconnect()
  }

  fun submitAnswer(roomId: String, questionId: String, answerIndex: Int) {
    webSocketManager.send(
      envelope(
        type = "round:submit_answer",
        payload = JSONObject()
          .put("roomId", roomId)
          .put("questionId", questionId)
          .put("answerIndex", answerIndex)
          .put("clientSentAt", Instant.now().toString())
      )
    )
  }

  fun activatePowerup(roomId: String, powerUpId: String, targetPlayerId: String? = null) {
    val payload = JSONObject()
      .put("roomId", roomId)
      .put("powerUpId", powerUpId)

    if (!targetPlayerId.isNullOrBlank()) {
      payload.put("targetPlayerId", targetPlayerId)
    }

    webSocketManager.send(envelope(type = "powerup:activate", payload = payload))
  }

  fun sendHeartbeat(roomId: String) {
    webSocketManager.send(
      envelope(
        type = "client:heartbeat",
        payload = JSONObject()
          .put("roomId", roomId)
          .put("sentAt", Instant.now().toString())
      )
    )
  }

  private fun connectIfAuthenticated(): Boolean {
    val accessToken = authRepository.currentAccessToken() ?: return false
    webSocketManager.connect(BuildConfig.WS_BASE_URL, accessToken)
    return true
  }

  private suspend fun cacheRoom(snapshot: RoomSnapshot) {
    database.cachedRoomDao().upsert(
      CachedRoomSnapshotEntity(
        roomId = snapshot.roomId,
        code = snapshot.code,
        phase = snapshot.phase,
        roundNumber = snapshot.roundNumber,
        totalRounds = snapshot.totalRounds
      )
    )
    database.cachedPlayerDao().upsertAll(
      snapshot.players.map { player ->
        CachedPlayerEntity(
          id = player.id,
          roomId = snapshot.roomId,
          displayName = player.displayName,
          score = player.score,
          streak = player.streak,
          isEliminated = player.isEliminated
        )
      }
    )
  }

  private fun envelope(type: String, payload: JSONObject): String {
    return JSONObject()
      .put("type", type)
      .put("version", "v1")
      .put("payload", payload)
      .toString()
  }

  private fun parseEvent(raw: String): GameEvent? {
    return runCatching {
      val envelope = JSONObject(raw)
      val type = (envelope.optString("type").ifBlank { envelope.optString("eventType") })
        .removePrefix("v1:")
      val payload = envelope.optJSONObject("payload") ?: envelope

      when (type) {
        "room:state_sync", "room:state" -> {
          val room = payload.optJSONObject("room") ?: payload
          val snapshot = parseRoom(room)
          GameEvent.RoomState(snapshot)
        }
        "room:player_joined" -> GameEvent.PlayerJoined(
          roomId = payload.optString("roomId"),
          player = parsePlayer(payload.optJSONObject("player") ?: JSONObject())
        )
        "room:player_left" -> GameEvent.PlayerLeft(
          roomId = payload.optString("roomId"),
          playerId = payload.optString("playerId")
        )
        "round:countdown_started" -> GameEvent.CountdownStarted(
          roomId = payload.optString("roomId"),
          startsAt = payload.optString("startsAt"),
          seconds = payload.optInt("seconds", 5)
        )
        "round:question_started", "round:question" -> GameEvent.QuestionStarted(
          roomId = payload.optString("roomId"),
          roundId = payload.optString("roundId"),
          questionId = payload.optString("questionId"),
          prompt = payload.optString("prompt"),
          answers = parseStringArray(payload.optJSONArray("answers") ?: payload.optJSONArray("options")),
          timeLimitMs = payload.optInt("timeLimitMs", 20_000),
          startedAt = payload.optString("startedAt")
        )
        "round:answer_locked" -> GameEvent.AnswerLocked(
          roomId = payload.optString("roomId"),
          roundId = payload.optString("roundId"),
          lockedAt = payload.optString("lockedAt")
        )
        "round:result", "round:end" -> GameEvent.RoundResult(
          roomId = payload.optString("roomId"),
          roundId = payload.optString("roundId"),
          correctAnswerIndex = payload.optInt("correctAnswerIndex", -1),
          rankings = parseRankings(payload.optJSONArray("rankings"))
        )
        "round:elimination" -> GameEvent.RoundElimination(
          roomId = payload.optString("roomId"),
          eliminatedPlayerIds = parseStringArray(payload.optJSONArray("eliminatedPlayerIds")),
          survivors = parsePlayers(payload.optJSONArray("survivors"))
        )
        "round:finale_started" -> GameEvent.FinaleStarted(
          roomId = payload.optString("roomId"),
          finalistIds = parseStringArray(payload.optJSONArray("finalistIds"))
        )
        "game:over", "game:end" -> GameEvent.GameOver(
          roomId = payload.optString("roomId"),
          winnerId = payload.optString("winnerId"),
          finalStandings = parseFinalStandings(payload.optJSONArray("finalStandings"))
        )
        "powerup:activated", "powerup:used" -> GameEvent.PowerupActivated(
          roomId = payload.optString("roomId"),
          playerId = payload.optString("playerId", payload.optString("userId")),
          powerupId = payload.optString("powerUpId", payload.optString("powerupCode"))
        )
        "v1:powerup:loot_drop", "powerup:loot_drop" -> GameEvent.LootDrop(
          powerupCode = payload.optString("powerupCode")
        )
        "server:error", "error" -> GameEvent.ServerError(
          message = payload.optString("message", payload.optString("error", "Server error")),
          code = payload.optString("code").takeIf { it.isNotBlank() }
        )
        else -> null
      }
    }.getOrNull()
  }

  private fun parseRoom(room: JSONObject): RoomSnapshot {
    val roomId = room.optString("roomId", room.optString("id", room.optString("code")))
    return RoomSnapshot(
      roomId = roomId,
      code = room.optString("code", room.optString("roomCode", roomId)),
      phase = room.optString("phase", room.optString("status", "WAITING")),
      roundNumber = room.optInt("roundNumber", 0),
      totalRounds = room.optInt("totalRounds", 10),
      players = parsePlayers(room.optJSONArray("players"))
    )
  }

  private fun parsePlayers(array: JSONArray?): List<GamePlayer> {
    if (array == null) return emptyList()
    return buildList {
      for (index in 0 until array.length()) {
        add(parsePlayer(array.optJSONObject(index) ?: JSONObject()))
      }
    }
  }

  private fun parsePlayer(player: JSONObject): GamePlayer {
    val id = player.optString("id", player.optString("playerId"))
    return GamePlayer(
      id = id,
      displayName = player.optString("displayName", player.optString("username", id.ifBlank { "Player" })),
      score = player.optInt("score", player.optInt("totalScore", 0)),
      streak = player.optInt("streak", 0),
      isEliminated = player.optBoolean("isEliminated", false),
      avatarUrl = player.optString("avatarUrl").takeIf { it.isNotBlank() }
    )
  }

  private fun parseStringArray(array: JSONArray?): List<String> {
    if (array == null) return emptyList()
    return buildList {
      for (index in 0 until array.length()) {
        val option = array.opt(index)
        add(
          when (option) {
            is JSONObject -> option.optString("text", option.optString("id"))
            else -> option?.toString().orEmpty()
          }
        )
      }
    }
  }

  private fun parseRankings(array: JSONArray?): List<ScoreRanking> {
    if (array == null) return emptyList()
    return buildList {
      for (index in 0 until array.length()) {
        val ranking = array.optJSONObject(index)
        if (ranking != null) {
          add(
            ScoreRanking(
              playerId = ranking.optString("playerId"),
              scoreDelta = ranking.optInt("scoreDelta", 0),
              totalScore = ranking.optInt("totalScore", ranking.optInt("score", 0))
            )
          )
        }
      }
    }
  }

  private fun parseFinalStandings(array: JSONArray?): List<FinalStanding> {
    if (array == null) return emptyList()
    return buildList {
      for (index in 0 until array.length()) {
        val standing = array.optJSONObject(index)
        if (standing != null) {
          add(
            FinalStanding(
              playerId = standing.optString("playerId"),
              rank = standing.optInt("rank", index + 1),
              score = standing.optInt("score", standing.optInt("totalScore", 0)),
              xpAwarded = standing.optInt("xpAwarded", 0)
            )
          )
        }
      }
    }
  }
}
