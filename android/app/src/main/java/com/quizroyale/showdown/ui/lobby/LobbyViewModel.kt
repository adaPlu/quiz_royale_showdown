package com.quizroyale.showdown.ui.lobby

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quizroyale.showdown.data.room.CachedRoomSummary
import com.quizroyale.showdown.data.room.RoomRepository
import com.quizroyale.showdown.data.room.RoomSnapshot
import com.quizroyale.showdown.data.socket.WebSocketManager
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

const val ROOM_REFERENCE_ARGUMENT = "roomReference"

data class LobbyUiState(
    val roomReference: String? = null,
    val room: RoomSnapshot? = null,
    val cachedRoom: CachedRoomSummary? = null,
    val isLoading: Boolean = true,
    val errorMessage: String? = null,
    val isStartingGame: Boolean = false,
    val gameStarted: Boolean = false,
)

@HiltViewModel
class LobbyViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val roomRepository: RoomRepository,
    private val webSocketManager: WebSocketManager,
) : ViewModel() {
    private val requestedRoomReference = savedStateHandle.get<String>(ROOM_REFERENCE_ARGUMENT)
        ?.trim()
        ?.uppercase()
        ?.takeIf { it.isNotBlank() }

    private val _uiState = MutableStateFlow(
        LobbyUiState(roomReference = requestedRoomReference)
    )
    val uiState: StateFlow<LobbyUiState> = _uiState.asStateFlow()

    init {
        loadRoom()
    }

    fun refreshRoom() {
        loadRoom()
    }

    fun dismissError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    fun leaveForHome() {
        webSocketManager.disconnect()
        _uiState.update {
            it.copy(
                room = null,
                isStartingGame = false,
                gameStarted = false,
            )
        }
    }

    fun startGame() {
        val roomId = _uiState.value.room?.roomId ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isStartingGame = true, errorMessage = null) }
            runCatching { roomRepository.startGame(roomId) }
                .onSuccess {
                    _uiState.update { it.copy(isStartingGame = false, gameStarted = true) }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isStartingGame = false,
                            errorMessage = error.message ?: "Failed to start game",
                        )
                    }
                }
        }
    }

    private fun loadRoom() {
        viewModelScope.launch {
            val cachedRoom = requestedRoomReference
                ?.let { roomRepository.getCachedRoom(it) }
                ?: roomRepository.latestCachedRoom()

            _uiState.update {
                it.copy(
                    roomReference = requestedRoomReference ?: cachedRoom?.roomReference,
                    cachedRoom = cachedRoom,
                    isLoading = true,
                    errorMessage = null,
                )
            }

            val roomReference = _uiState.value.roomReference
            if (roomReference.isNullOrBlank()) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "No room selected yet. Create or join one from Home.",
                    )
                }
                return@launch
            }

            runCatching {
                roomRepository.refreshRoom(roomReference)
            }.onSuccess { room ->
                _uiState.update {
                    it.copy(
                        roomReference = room.roomReference,
                        room = room,
                        cachedRoom = room.toCachedRoomSummary(),
                        isLoading = false,
                    )
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = error.message ?: "Unable to refresh the room right now.",
                    )
                }
            }
        }
    }

    private fun RoomSnapshot.toCachedRoomSummary(): CachedRoomSummary = CachedRoomSummary(
        roomId = roomId,
        roomReference = roomReference,
        phase = phase,
        roundNumber = roundNumber,
        totalRounds = totalRounds,
        cachedAt = System.currentTimeMillis(),
    )
}
