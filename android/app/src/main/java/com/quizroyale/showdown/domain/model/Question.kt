package com.quizroyale.showdown.domain.model

data class Question(
    val id: String,
    val prompt: String,
    val options: List<AnswerOption>,
    val timeLimitMs: Int,
    val category: String? = null,
    val difficulty: Int = 1,
)
