package com.quizroyale.showdown.ui.game

sealed interface GameUiState {
  data object Idle : GameUiState

  data class Lobby(
    val roomId: String = "",
    val roomCode: String = "",
    val players: List<PlayerUiModel> = emptyList(),
    val phaseLabel: String = "WAITING"
  ) : GameUiState

  data class Countdown(
    val roomId: String,
    val seconds: Int,
    val players: List<PlayerUiModel>
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
    val selectedAnswerIndex: Int? = null,
    val isAnswerLocked: Boolean = false,
    val correctAnswerIndex: Int? = null
  ) : GameUiState

  data class RoundResult(
    val roomId: String,
    val summary: String,
    val players: List<PlayerUiModel>,
    val correctAnswerIndex: Int? = null
  ) : GameUiState

  data class Elimination(
    val roomId: String,
    val eliminatedPlayerIds: List<String>,
    val players: List<PlayerUiModel>
  ) : GameUiState

  data class Finale(
    val roomId: String,
    val finalistIds: List<String>,
    val players: List<PlayerUiModel>
  ) : GameUiState

  data class GameOver(
    val roomId: String,
    val winnerId: String,
    val players: List<PlayerUiModel>,
    val xpAwarded: Int
  ) : GameUiState
}

data class PlayerUiModel(
  val id: String,
  val displayName: String,
  val score: Int,
  val streak: Int,
  val isEliminated: Boolean,
  val avatarUrl: String? = null
)
