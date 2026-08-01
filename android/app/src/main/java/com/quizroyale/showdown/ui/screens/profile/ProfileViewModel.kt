package com.quizroyale.showdown.ui.screens.profile

import androidx.lifecycle.ViewModel
import com.quizroyale.showdown.data.auth.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
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
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<ProfileUiState>(ProfileUiState.Loading)
    val uiState: StateFlow<ProfileUiState> = _uiState

    init {
        _uiState.value = ProfileUiState.Success(
            displayName = authRepository.currentUserId() ?: "Player",
            avatarUrl = null,
            level = 1,
            xp = 0,
            xpToNextLevel = 150,
            wins = 0,
            gamesPlayed = 0
        )
    }
}
