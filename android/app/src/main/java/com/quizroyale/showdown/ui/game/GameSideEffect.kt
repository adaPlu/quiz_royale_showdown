package com.quizroyale.showdown.ui.game

import com.quizroyale.showdown.domain.model.PowerupType

sealed class GameSideEffect {
    data object HapticFeedback : GameSideEffect()
    data class ShowToast(val message: String) : GameSideEffect()
    data class ShowLevelUp(val newLevel: Int) : GameSideEffect()
    data class NavigateToResults(val roomId: String) : GameSideEffect()
    /** Fired when a power-up loot-drop envelope arrives; triggers the animated banner. */
    data class ShowLootDrop(val powerupType: PowerupType) : GameSideEffect()
    /** Correct answer was revealed — trigger haptic + SFX. */
    data object CorrectAnswerRevealed : GameSideEffect()
    /** Local player was eliminated — trigger haptic + SFX. */
    data object PlayerEliminated : GameSideEffect()
    /** Answer submitted — trigger haptic + SFX. */
    data object AnswerSubmitted : GameSideEffect()
}
