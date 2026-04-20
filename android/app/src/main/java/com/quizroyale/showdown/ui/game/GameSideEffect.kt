package com.quizroyale.showdown.ui.game

sealed class GameSideEffect {
    data object HapticFeedback : GameSideEffect()
    data class ShowToast(val message: String) : GameSideEffect()
    data class ShowLevelUp(val newLevel: Int) : GameSideEffect()
    data class NavigateToResults(val roomId: String) : GameSideEffect()
    data class ShowLootDrop(val powerupCode: String) : GameSideEffect()
    data object PlayCorrect : GameSideEffect()
    data object PlayWrong : GameSideEffect()
    data object PlayElimination : GameSideEffect()
    data object PlayVictory : GameSideEffect()
    data object PlayPowerup : GameSideEffect()
}
