package com.quizroyale.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quizroyale.data.network.WsClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject

data class UiChoice(val id: String, val text: String)
data class UiQuestion(val id: String, val text: String, val choices: List<UiChoice>)

sealed class MatchUiState {
  data object Disconnected : MatchUiState()
  data object Connecting : MatchUiState()
  data class Queueing(val playersInQueue: Int) : MatchUiState()
  data class Lobby(val matchId: String, val startAtMs: Long, val players: Int) : MatchUiState()
  data class InRound(val matchId: String, val round: Int, val endsAtMs: Long, val question: UiQuestion) : MatchUiState()
  data class RoundResult(val alive: Boolean, val correctChoiceId: String, val playersAlive: Int) : MatchUiState()
  data class Ended(val finalRank: Int, val xp: Int, val coins: Int) : MatchUiState()
  data class Error(val message: String) : MatchUiState()
}

class MatchViewModel : ViewModel() {

  private val _state = MutableStateFlow<MatchUiState>(MatchUiState.Disconnected)
  val state: StateFlow<MatchUiState> = _state

  // Emulator connects to your PC localhost via 10.0.2.2
  private val wsUrl = "ws://10.0.2.2:3000/ws"

  private var client: WsClient? = null
  private var currentMatchId: String? = null
  private var currentRound: Int = 0

  fun connect() {
    if (client != null) return
    _state.value = MatchUiState.Connecting

    client = WsClient(
      url = wsUrl,
      onOpen = {
        viewModelScope.launch(Dispatchers.Main) { _state.value = MatchUiState.Queueing(playersInQueue = 0) }
      },
      onText = { text -> handleMessage(text) },
      onClosed = {
        viewModelScope.launch(Dispatchers.Main) {
          client = null
          _state.value = MatchUiState.Disconnected
        }
      },
      onFailure = { t ->
        viewModelScope.launch(Dispatchers.Main) {
          client = null
          _state.value = MatchUiState.Error("WS fail: ${t.message}")
        }
      }
    )

    client?.connect()
  }

  fun disconnect() {
    client?.close()
    client = null
    _state.value = MatchUiState.Disconnected
  }

  fun joinQuickMatch() {
    // JOIN_MATCH
    val msg = """{"type":"JOIN_MATCH","payload":{"mode":"QUICK","clientVersion":"0.0.1"}}"""
    client?.send(msg)
  }

  fun submitAnswer(choiceId: String) {
    val matchId = currentMatchId ?: return
    val msg = """{"type":"SUBMIT_ANSWER","payload":{"matchId":"$matchId","round":$currentRound,"choiceId":"$choiceId","clientTimeMs":${System.currentTimeMillis()}}}"""
    client?.send(msg)
  }

  private fun handleMessage(text: String) {
    viewModelScope.launch(Dispatchers.Main) {
      try {
        val root = JSONObject(text)
        val type = root.getString("type")
        val payload = root.getJSONObject("payload")

        when (type) {
          "LOBBY_UPDATE" -> {
            val q = payload.getInt("playersInQueue")
            _state.value = MatchUiState.Queueing(q)
          }

          "MATCH_FOUND" -> {
            val matchId = payload.getString("matchId")
            val startAtMs = payload.getLong("startAtMs")
            val players = payload.getInt("players")
            currentMatchId = matchId
            _state.value = MatchUiState.Lobby(matchId, startAtMs, players)
          }

          "ROUND_START" -> {
            val matchId = payload.getString("matchId")
            val round = payload.getInt("round")
            val endsAtMs = payload.getLong("endsAtMs")
            val qObj = payload.getJSONObject("question")

            val qId = qObj.getString("id")
            val qText = qObj.getString("text")
            val choicesArr = qObj.getJSONArray("choices")
            val choices = buildList {
              for (i in 0 until choicesArr.length()) {
                val c = choicesArr.getJSONObject(i)
                add(UiChoice(c.getString("id"), c.getString("text")))
              }
            }

            currentMatchId = matchId
            currentRound = round
            _state.value = MatchUiState.InRound(matchId, round, endsAtMs, UiQuestion(qId, qText, choices))
          }

          "ROUND_RESULT" -> {
            val you = payload.getJSONObject("you")
            val alive = you.getBoolean("alive")
            val correctChoiceId = payload.getString("correctChoiceId")
            val playersAlive = payload.getInt("playersAlive")
            _state.value = MatchUiState.RoundResult(alive, correctChoiceId, playersAlive)
          }

          "MATCH_END" -> {
            val finalRank = payload.getInt("finalRank")
            val rewards = payload.getJSONObject("rewards")
            val xp = rewards.getInt("xp")
            val coins = rewards.getInt("coins")
            _state.value = MatchUiState.Ended(finalRank, xp, coins)
          }

          "ERROR" -> {
            _state.value = MatchUiState.Error(payload.optString("message", "Unknown error"))
          }
        }
      } catch (e: Exception) {
        _state.value = MatchUiState.Error("Parse error: ${e.message}\n$text")
      }
    }
  }
}