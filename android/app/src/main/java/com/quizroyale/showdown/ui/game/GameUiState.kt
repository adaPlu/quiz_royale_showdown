package com.quizroyale.showdown.ui.game

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
    val players: List<PlayerUiModel>,
    val phaseLabel: String
  ) : GameUiState

  data class RoundResult(
    val roomId: String,
    val summary: String,
    val players: List<PlayerUiModel>
  ) : GameUiState
}

data class PlayerUiModel(
  val id: String,
  val displayName: String,
  val score: Int,
  val streak: Int,
  val isEliminated: Boolean
)
