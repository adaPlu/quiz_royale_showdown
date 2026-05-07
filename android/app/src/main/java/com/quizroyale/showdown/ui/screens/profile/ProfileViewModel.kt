package com.quizroyale.showdown.ui.screens.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quizroyale.showdown.data.auth.AuthRepository
import com.quizroyale.showdown.data.user.UserApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface ProfileUiState {
    data object Loading : ProfileUiState
    data class Error(val message: String) : ProfileUiState
    data class Success(
        val displayName: String,
        val avatarUrl: String?,
        val level: Int,
        val xp: Int,
        val xpToNextLevel: Int,
        val wins: Int,
        val gamesPlayed: Int
    ) : ProfileUiState
}

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val userApi: UserApi,
) : ViewModel() {

    private val _uiState = MutableStateFlow<ProfileUiState>(ProfileUiState.Loading)
    val uiState: StateFlow<ProfileUiState> = _uiState

    init {
        loadProfile()
    }

    fun loadProfile() {
        viewModelScope.launch {
            _uiState.value = ProfileUiState.Loading
            try {
                val profile = userApi.getMe()
                _uiState.value = ProfileUiState.Success(
                    displayName = profile.displayName,
                    avatarUrl = profile.avatarUrl,
                    level = profile.level,
                    xp = profile.totalXp,
                    xpToNextLevel = profile.xpToNextLevel,
                    wins = profile.wins,
                    gamesPlayed = profile.gamesPlayed,
                )
            } catch (e: Exception) {
                _uiState.value = ProfileUiState.Success(
                    displayName = authRepository.currentUsername() ?: "Player",
                    avatarUrl = null,
                    level = 1,
                    xp = 0,
                    xpToNextLevel = 150,
                    wins = 0,
                    gamesPlayed = 0,
                )
            }
        }
    }
}
