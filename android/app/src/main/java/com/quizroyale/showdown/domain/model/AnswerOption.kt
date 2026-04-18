package com.quizroyale.showdown.domain.model

data class AnswerOption(
    val index: Int,
    val text: String,
    val isCorrect: Boolean = false,
)
