package com.quizroyale.showdown.ui.screens.results

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quizroyale.showdown.data.auth.AuthRepository
import com.quizroyale.showdown.data.results.ResultsStore
import com.quizroyale.showdown.domain.model.LeaderboardEntry
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
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
    private val resultsStore: ResultsStore,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ResultsUiState(currentUserId = authRepository.currentUserId()))
    val uiState: StateFlow<ResultsUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            resultsStore.results.collect { data ->
                if (data != null) {
                    _uiState.value = _uiState.value.copy(
                        leaderboard = data.leaderboard,
                        winner = data.leaderboard.firstOrNull(),
                        xpEarned = data.xpEarned,
                    )
                }
            }
        }
    }

    fun setResults(leaderboard: List<LeaderboardEntry>, xpEarned: Int) {
        resultsStore.setResults(leaderboard, xpEarned)
    }
}
