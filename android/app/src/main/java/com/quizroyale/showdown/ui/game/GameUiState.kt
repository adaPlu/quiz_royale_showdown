package com.quizroyale.showdown.ui.game

import com.quizroyale.showdown.domain.model.PowerupType

sealed interface GameUiState {
  data object Idle : GameUiState

  data class Lobby(
    val roomCode: String = "",
    val players: List<PlayerUiModel> = emptyList()
  ) : GameUiState

  data class ActiveQuestion(
    val roomId: String,
    val roundId: String,
    val questionId: String,
    val prompt: String,
    val answers: List<String>,
    val timeLimitMs: Int,
    val timerSeconds: Int,
    val players: List<PlayerUiModel>,
    val phaseLabel: String,
    val selectedOptionIndex: Int? = null,
    /** Power-ups owned by the local player for this round. */
    val ownedPowerups: List<OwnedPowerup> = emptyList(),
  ) : GameUiState

  data class RoundResult(
    val roomId: String,
    val summary: String,
    val players: List<PlayerUiModel>
  ) : GameUiState

  data class GameOver(
    val roomId: String,
    val players: List<PlayerUiModel>
  ) : GameUiState
}

data class PlayerUiModel(
  val id: String,
  val displayName: String,
  val score: Int,
  val streak: Int,
  val isEliminated: Boolean,
)

/**
 * Represents a power-up slot in the player's tray.
 *
 * @param type        Which power-up this is.
 * @param quantity    How many charges remain.
 * @param usedThisRound Whether the player already activated it this round.
 */
data class OwnedPowerup(
  val type: PowerupType,
  val quantity: Int,
  val usedThisRound: Boolean = false,
)
