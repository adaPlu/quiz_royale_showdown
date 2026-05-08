package com.quizroyale.showdown.data.results

import com.quizroyale.showdown.domain.model.LeaderboardEntry
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

data class ResultsData(
    val leaderboard: List<LeaderboardEntry>,
    val xpEarned: Int,
)

@Singleton
class ResultsStore @Inject constructor() {
    private val _results = MutableStateFlow<ResultsData?>(null)
    val results: StateFlow<ResultsData?> = _results.asStateFlow()

    fun setResults(leaderboard: List<LeaderboardEntry>, xpEarned: Int) {
        _results.value = ResultsData(leaderboard, xpEarned)
    }

    fun clear() {
        _results.value = null
    }
}
