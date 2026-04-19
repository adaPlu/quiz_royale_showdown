package com.quizroyale.showdown.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quizroyale.showdown.data.auth.AuthRepository
import com.quizroyale.showdown.data.game.GameRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HomeUiState(
    val username: String? = null,
    val isLoading: Boolean = false,
    val error: String? = null,
    val navigateToRoomId: String? = null,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val gameRepository: GameRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState(username = authRepository.currentUsername()))
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    fun quickPlay() = createRoomInternal(isPrivate = false)
    fun createRoom() = createRoomInternal(isPrivate = true)

    fun joinByCode(code: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            runCatching { gameRepository.getRoom(code) }
                .onSuccess { room -> _uiState.update { it.copy(navigateToRoomId = room.code, isLoading = false) } }
                .onFailure { e -> _uiState.update { it.copy(error = e.message ?: "Failed to join", isLoading = false) } }
        }
    }

    fun onNavigated() = _uiState.update { it.copy(navigateToRoomId = null) }

    private fun createRoomInternal(isPrivate: Boolean) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            runCatching { gameRepository.createRoom(isPrivate = isPrivate, maxPlayers = 8) }
                .onSuccess { room -> _uiState.update { it.copy(navigateToRoomId = room.code, isLoading = false) } }
                .onFailure { e -> _uiState.update { it.copy(error = e.message ?: "Failed to create room", isLoading = false) } }
        }
    }
}
