package com.quizroyale.showdown.ui.lobby

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quizroyale.showdown.data.auth.AuthRepository
import com.quizroyale.showdown.data.remote.model.WsEnvelope
import com.quizroyale.showdown.data.socket.WebSocketManager
import com.quizroyale.showdown.domain.model.GamePlayer
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import org.json.JSONObject
import javax.inject.Inject

data class LobbyUiState(
    val players: List<GamePlayer> = emptyList(),
    val maxPlayers: Int = 8,
    val currentUserId: String = "",
    val isHost: Boolean = false,
    val allPlayersReady: Boolean = false,
    val gameStarted: Boolean = false,
    val roomCode: String = "",
    val error: String? = null,
)

sealed class LobbyIntent {
    data object ToggleReady : LobbyIntent()
    data object StartGame : LobbyIntent()
    data object LeaveRoom : LobbyIntent()
}

@HiltViewModel
class LobbyViewModel @Inject constructor(
    private val wsManager: WebSocketManager,
    private val authRepository: AuthRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val roomId: String = checkNotNull(savedStateHandle["roomId"])
    private val userId: String get() = authRepository.currentUserId()

    private val _uiState = MutableStateFlow(LobbyUiState(currentUserId = userId))
    val uiState: StateFlow<LobbyUiState> = _uiState.asStateFlow()

    init { observeWsEvents() }

    fun onIntent(intent: LobbyIntent) {
        when (intent) {
            LobbyIntent.ToggleReady -> sendReady()
            LobbyIntent.StartGame -> sendStartGame()
            LobbyIntent.LeaveRoom -> { /* caller navigates up */ }
        }
    }

    private fun observeWsEvents() {
        wsManager.events.onEach { rawEvent ->
            runCatching {
                val json = JSONObject(rawEvent)
                val type = json.optString("type")
                val payload = json.optJSONObject("payload") ?: JSONObject()
                when {
                    type.contains("room_state") || type.contains("room:state") -> {
                        val playersArray = payload.optJSONArray("players")
                        val players = buildList {
                            if (playersArray != null) {
                                for (i in 0 until playersArray.length()) {
                                    val o = playersArray.getJSONObject(i)
                                    add(
                                        GamePlayer(
                                            id = o.optString("id"),
                                            displayName = o.optString("displayName", o.optString("username")),
                                            score = o.optInt("score", 0),
                                            streak = o.optInt("streak", 0),
                                            isEliminated = o.optBoolean("isEliminated", false),
                                            avatarUrl = o.optString("avatarUrl").takeIf { it.isNotEmpty() },
                                        )
                                    )
                                }
                            }
                        }
                        val hostId = payload.optString("hostId")
                        _uiState.update {
                            it.copy(
                                players = players,
                                isHost = hostId == userId,
                                roomCode = payload.optString("roomCode").takeIf { c -> c.isNotEmpty() } ?: it.roomCode,
                                allPlayersReady = players.isNotEmpty() && payload.optBoolean("allReady", false),
                            )
                        }
                    }
                    type.contains("countdown") -> _uiState.update { it.copy(gameStarted = true) }
                }
            }
        }.launchIn(viewModelScope)
    }

    private fun sendReady() {
        wsManager.send(
            """{"type":"v1:player_ready","roomId":"$roomId","senderId":"$userId","ts":${System.currentTimeMillis()},"payload":{"ready":true}}"""
        )
    }

    private fun sendStartGame() {
        wsManager.send(
            """{"type":"v1:start_game","roomId":"$roomId","senderId":"$userId","ts":${System.currentTimeMillis()},"payload":{"startGame":true}}"""
        )
    }
}
