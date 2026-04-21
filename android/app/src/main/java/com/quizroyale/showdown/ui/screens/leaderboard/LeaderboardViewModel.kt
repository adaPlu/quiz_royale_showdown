package com.quizroyale.showdown.ui.screens.leaderboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quizroyale.showdown.data.auth.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.Retrofit
import javax.inject.Inject

enum class LeaderboardTab(val label: String, val endpoint: String) {
    Season("Season", "leaderboard?season=current&limit=100"),
    Global("Global", "leaderboard?limit=100"),
    Friends("Friends", "leaderboard/friends?limit=50"),
}

data class LeaderboardEntry(
    val userId: String,
    val displayName: String,
    val scoreLabel: String
)

data class LeaderboardUiState(
    val activeTab: LeaderboardTab = LeaderboardTab.Season,
    val entries: List<LeaderboardEntry> = emptyList(),
    val loading: Boolean = false
)

@HiltViewModel
class LeaderboardViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val retrofit: Retrofit
) : ViewModel() {

    private val _uiState = MutableStateFlow(LeaderboardUiState(loading = true))
    val uiState: StateFlow<LeaderboardUiState> = _uiState

    private val leaderboardApi by lazy { retrofit.create(LeaderboardApi::class.java) }

    init {
        loadTab(LeaderboardTab.Season)
    }

    fun setTab(tab: LeaderboardTab) {
        _uiState.update { it.copy(activeTab = tab, loading = true) }
        loadTab(tab)
    }

    private fun loadTab(tab: LeaderboardTab) {
        viewModelScope.launch {
            try {
                val token = authRepository.currentAccessToken() ?: ""
                val entries = when (tab) {
                    LeaderboardTab.Season -> leaderboardApi.getSeason("Bearer $token")
                    LeaderboardTab.Global -> leaderboardApi.getGlobal("Bearer $token")
                    LeaderboardTab.Friends -> leaderboardApi.getFriends("Bearer $token")
                }
                _uiState.update {
                    it.copy(
                        loading = false,
                        entries = entries.map { row ->
                            LeaderboardEntry(
                                userId = row.userId,
                                displayName = row.displayName,
                                scoreLabel = when {
                                    row.mmr != null -> "${row.mmr} MMR"
                                    row.totalXp != null -> "${row.totalXp} XP"
                                    else -> ""
                                }
                            )
                        }
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(loading = false, entries = emptyList()) }
            }
        }
    }
}
