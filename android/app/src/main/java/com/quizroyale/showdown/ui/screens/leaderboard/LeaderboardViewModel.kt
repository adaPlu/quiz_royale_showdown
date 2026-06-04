package com.quizroyale.showdown.ui.screens.leaderboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quizroyale.showdown.data.leaderboard.LeaderboardApi
import com.quizroyale.showdown.ui.common.toUiMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class LeaderboardTab(val label: String, val endpoint: String) {
    Season("Season", "leaderboard?season=current&limit=100"),
    Global("Global", "leaderboard?limit=100"),
    Friends("Friends", "leaderboard/friends?limit=50"),
}

data class LeaderboardUiEntry(
    val userId: String,
    val displayName: String,
    val scoreLabel: String
)

data class LeaderboardUiState(
    val activeTab: LeaderboardTab = LeaderboardTab.Season,
    val entries: List<LeaderboardUiEntry> = emptyList(),
    val loading: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class LeaderboardViewModel @Inject constructor(
    private val leaderboardApi: LeaderboardApi
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
            try {
                val entries = when (tab) {
                    LeaderboardTab.Season -> leaderboardApi.getSeason()
                    LeaderboardTab.Global -> leaderboardApi.getGlobal()
                    LeaderboardTab.Friends -> leaderboardApi.getFriends()
                }
                _uiState.update {
                    it.copy(
                        loading = false,
                        entries = entries.map { row ->
                            LeaderboardUiEntry(
                                userId = row.userId,
                                displayName = row.displayName,
                                scoreLabel = "${row.mmr} MMR"
                            )
                        }
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(loading = false, entries = emptyList(), error = e.toUiMessage()) }
            }
        }
    }
}
