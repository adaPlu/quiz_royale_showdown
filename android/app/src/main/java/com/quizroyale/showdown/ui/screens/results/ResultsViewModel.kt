package com.quizroyale.showdown.ui.screens.results

import androidx.lifecycle.ViewModel
import com.quizroyale.showdown.data.auth.AuthRepository
import com.quizroyale.showdown.domain.model.LeaderboardEntry
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

data class ResultsUiState(
    val leaderboard: List<LeaderboardEntry> = emptyList(),
    val winner: LeaderboardEntry? = null,
    val xpEarned: Int? = null,
    val currentUserId: String = "",
)

@HiltViewModel
class ResultsViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ResultsUiState(currentUserId = authRepository.currentUserId()))
    val uiState: StateFlow<ResultsUiState> = _uiState.asStateFlow()

    fun setResults(leaderboard: List<LeaderboardEntry>, xpEarned: Int) {
        _uiState.value = _uiState.value.copy(
            leaderboard = leaderboard,
            winner = leaderboard.firstOrNull(),
            xpEarned = xpEarned,
        )
    }
}
