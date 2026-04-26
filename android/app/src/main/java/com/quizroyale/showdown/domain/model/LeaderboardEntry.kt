package com.quizroyale.showdown.domain.model

data class LeaderboardEntry(
    val rank: Int,
    val playerId: String,
    val displayName: String,
    val score: Int,
    val correctAnswers: Int,
    val totalAnswers: Int,
)
