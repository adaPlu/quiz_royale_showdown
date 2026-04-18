package com.quizroyale.showdown.ui.lobby

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quizroyale.showdown.data.auth.AuthRepository
import com.quizroyale.showdown.data.game.GameEvent
import com.quizroyale.showdown.data.game.GameRepository
import com.quizroyale.showdown.domain.model.GamePlayer
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LobbyUiState(
  val players: List<GamePlayer> = emptyList(),
  val maxPlayers: Int = 8,
  val currentUserId: String = "",
  val isHost: Boolean = false,
  val allPlayersReady: Boolean = false,
  val gameStarted: Boolean = false,
  val roomId: String = "",
  val roomCode: String = "",
  val phase: String = "WAITING",
  val countdownSeconds: Int? = null,
  val error: String? = null
)

sealed class LobbyIntent {
  data class JoinRoom(val roomCode: String) : LobbyIntent()
  data object StartGame : LobbyIntent()
  data object LeaveRoom : LobbyIntent()
}

@HiltViewModel
class LobbyViewModel @Inject constructor(
  private val gameRepository: GameRepository,
  private val authRepository: AuthRepository,
  savedStateHandle: SavedStateHandle
) : ViewModel() {

  private val initialRoomCode: String = savedStateHandle["roomId"] ?: ""
  private val userId: String get() = authRepository.currentUserId()

  private val _uiState = MutableStateFlow(
    LobbyUiState(currentUserId = userId, roomCode = initialRoomCode, roomId = initialRoomCode)
  )
  val uiState: StateFlow<LobbyUiState> = _uiState.asStateFlow()

  init {
    observeGameEvents()
    if (initialRoomCode.isNotBlank()) {
      joinRoom(initialRoomCode)
    }
  }

  fun onIntent(intent: LobbyIntent) {
    when (intent) {
      is LobbyIntent.JoinRoom -> joinRoom(intent.roomCode)
      LobbyIntent.StartGame -> startGame()
      LobbyIntent.LeaveRoom -> leaveRoom()
    }
  }

  fun joinRoom(roomCode: String) {
    val joined = gameRepository.joinRoom(roomCode)
    _uiState.update {
      it.copy(
        roomCode = roomCode,
        roomId = it.roomId.ifBlank { roomCode },
        error = if (joined) null else "Sign in required before joining a room."
      )
    }
  }

  private fun startGame() {
    val roomId = _uiState.value.roomId.ifBlank { return }
    viewModelScope.launch {
      runCatching { gameRepository.startRoom(roomId) }
        .onFailure { error ->
          _uiState.update { it.copy(error = error.message ?: "Failed to start game.") }
        }
    }
  }

  private fun leaveRoom() {
    val roomId = _uiState.value.roomId.ifBlank { return }
    viewModelScope.launch {
      runCatching { gameRepository.leaveRoom(roomId) }
        .onFailure { error ->
          _uiState.update { it.copy(error = error.message ?: "Failed to leave room.") }
        }
    }
  }

  private fun observeGameEvents() {
    gameRepository.events
      .onEach { event ->
        when (event) {
          is GameEvent.RoomState -> _uiState.update {
            it.copy(
              players = event.room.players,
              roomId = event.room.roomId,
              roomCode = event.room.code,
              phase = event.room.phase,
              gameStarted = event.room.phase != "WAITING",
              error = null
            )
          }
          is GameEvent.PlayerJoined -> updatePlayers(event.roomId) { players ->
            (players.filterNot { it.id == event.player.id } + event.player)
              .sortedByDescending { it.score }
          }
          is GameEvent.PlayerLeft -> updatePlayers(event.roomId) { players ->
            players.filterNot { it.id == event.playerId }
          }
          is GameEvent.CountdownStarted -> updateIfRoomMatches(event.roomId) {
            it.copy(
              phase = "COUNTDOWN",
              gameStarted = true,
              countdownSeconds = event.seconds
            )
          }
          is GameEvent.ServerError -> _uiState.update { it.copy(error = event.message) }
          else -> Unit
        }
      }
      .launchIn(viewModelScope)
  }

  private fun updatePlayers(roomId: String, transform: (List<GamePlayer>) -> List<GamePlayer>) {
    updateIfRoomMatches(roomId) { state -> state.copy(players = transform(state.players)) }
  }

  private fun updateIfRoomMatches(roomId: String, transform: (LobbyUiState) -> LobbyUiState) {
    _uiState.update { state ->
      if (roomId.isBlank() || state.roomId.isBlank() || roomId == state.roomId || roomId == state.roomCode) {
        transform(state)
      } else {
        state
      }
    }
  }
}
