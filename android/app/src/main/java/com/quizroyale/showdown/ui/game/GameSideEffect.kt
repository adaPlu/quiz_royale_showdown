package com.quizroyale.showdown.ui.game

sealed class GameSideEffect {
    data object HapticFeedback : GameSideEffect()
    data class ShowToast(val message: String) : GameSideEffect()
    data class ShowLevelUp(val newLevel: Int) : GameSideEffect()
    data class NavigateToResults(val roomId: String) : GameSideEffect()
}
