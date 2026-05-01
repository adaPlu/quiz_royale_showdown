package com.quizroyale.showdown.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quizroyale.showdown.data.auth.AuthRepository
import com.quizroyale.showdown.data.room.CachedRoomSummary
import com.quizroyale.showdown.data.room.RoomRepository
import com.quizroyale.showdown.data.socket.WebSocketManager
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class HomeUiState(
    val joinCode: String = "",
    val recentRoom: CachedRoomSummary? = null,
    val activeAction: HomeAction? = null,
    val errorMessage: String? = null,
    val navigateToLobby: String? = null,
    val navigateToLogin: Boolean = false,
)

enum class HomeAction {
    CREATE_OPEN,
    CREATE_PRIVATE,
    JOIN_BY_CODE,
}

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val roomRepository: RoomRepository,
    private val authRepository: AuthRepository,
    private val webSocketManager: WebSocketManager,
) : ViewModel() {
    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            roomRepository.observeLatestCachedRoom().collect { cachedRoom ->
                _uiState.update { currentState ->
                    currentState.copy(recentRoom = cachedRoom)
                }
            }
        }
    }

    fun onJoinCodeChange(value: String) {
        val normalized = value
            .uppercase()
            .filter { it.isLetterOrDigit() }
            .take(MAX_ROOM_REFERENCE_LENGTH)
        _uiState.update {
            it.copy(
                joinCode = normalized,
                errorMessage = null,
            )
        }
    }

    fun createOpenRoom() = createRoom(HomeAction.CREATE_OPEN, isPrivate = false)

    fun createPrivateRoom() = createRoom(HomeAction.CREATE_PRIVATE, isPrivate = true)

    fun joinByCode() {
        val roomCode = _uiState.value.joinCode.trim().uppercase()
        if (roomCode.length < MIN_ROOM_CODE_LENGTH) {
            _uiState.update {
                it.copy(errorMessage = "Enter a valid room code to join.")
            }
            return
        }

        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    activeAction = HomeAction.JOIN_BY_CODE,
                    errorMessage = null,
                )
            }
            runCatching {
                roomRepository.joinRoom(roomCode)
            }.onSuccess { room ->
                _uiState.update {
                    it.copy(
                        activeAction = null,
                        navigateToLobby = room.roomReference,
                    )
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        activeAction = null,
                        errorMessage = error.message ?: "Unable to join that room right now.",
                    )
                }
            }
        }
    }

    fun resumeRecentRoom() {
        val recentRoomReference = _uiState.value.recentRoom?.roomReference ?: return
        _uiState.update {
            it.copy(navigateToLobby = recentRoomReference)
        }
    }

    fun onNavigationHandled() {
        _uiState.update { it.copy(navigateToLobby = null, navigateToLogin = false) }
    }

    fun dismissError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    fun logout() {
        webSocketManager.disconnect()
        authRepository.clearSession()
        _uiState.update {
            it.copy(
                activeAction = null,
                errorMessage = null,
                navigateToLogin = true,
            )
        }
    }

    private fun createRoom(action: HomeAction, isPrivate: Boolean) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    activeAction = action,
                    errorMessage = null,
                )
            }
            runCatching {
                roomRepository.createRoom(isPrivate = isPrivate)
            }.onSuccess { room ->
                _uiState.update {
                    it.copy(
                        activeAction = null,
                        navigateToLobby = room.roomReference,
                    )
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        activeAction = null,
                        errorMessage = error.message ?: "Unable to create a room right now.",
                    )
                }
            }
        }
    }

    companion object {
        private const val MIN_ROOM_CODE_LENGTH = 4
        private const val MAX_ROOM_REFERENCE_LENGTH = 8
    }
}
