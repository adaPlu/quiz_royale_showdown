package com.quizroyale.showdown.domain.model

data class GamePlayer(
    val id: String,
    val displayName: String,
    val score: Int,
    val streak: Int,
    val isEliminated: Boolean,
    val avatarUrl: String? = null,
)
