package com.quizroyale.showdown.ui.screens.leaderboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quizroyale.showdown.data.auth.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class LeaderboardTab(val label: String) {
    Season("Season"),
    Global("Global"),
    Friends("Friends"),
}

data class LeaderboardEntry(
    val userId: String,
    val displayName: String,
    val scoreLabel: String,
)

data class LeaderboardUiState(
    val activeTab: LeaderboardTab = LeaderboardTab.Season,
    val entries: List<LeaderboardEntry> = emptyList(),
    val loading: Boolean = false,
)

@HiltViewModel
class LeaderboardViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LeaderboardUiState(loading = true))
    val uiState: StateFlow<LeaderboardUiState> = _uiState

    init {
        loadTab(LeaderboardTab.Season)
    }

    fun setTab(tab: LeaderboardTab) {
        _uiState.update { it.copy(activeTab = tab, loading = true) }
        loadTab(tab)
    }

    private fun loadTab(tab: LeaderboardTab) {
        viewModelScope.launch {
            authRepository.currentAccessToken()
            // Global and friends leaderboards are out of beta launch scope until routes are mounted.
            _uiState.update { it.copy(activeTab = tab, loading = false, entries = emptyList()) }
        }
    }
}
