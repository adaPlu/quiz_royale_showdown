package com.quizroyale.showdown.ui.game

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quizroyale.showdown.BuildConfig
import com.quizroyale.showdown.data.auth.AuthRepository
import com.quizroyale.showdown.data.socket.WebSocketManager
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class GameViewModel @Inject constructor(
  private val authRepository: AuthRepository,
  private val webSocketManager: WebSocketManager
) : ViewModel() {
  private val _uiState = MutableStateFlow<GameUiState>(GameUiState.Lobby())
  val uiState: GameUiState get() = _uiState.value
  val uiStateFlow: StateFlow<GameUiState> = _uiState.asStateFlow()

  fun joinRoom(roomCode: String) {
    val accessToken = authRepository.currentAccessToken() ?: return
    webSocketManager.connect(BuildConfig.WS_BASE_URL, accessToken)
    webSocketManager.send(
      """{"type":"room:join","version":"v1","payload":{"roomCode":"$roomCode"}}"""
    )
    _uiState.value = GameUiState.Lobby(roomCode = roomCode)
  }

  fun submitAnswer(answerIndex: Int) {
    val state = _uiState.value
    if (state !is GameUiState.ActiveQuestion) {
      return
    }

    webSocketManager.send(
      """{"type":"round:submit_answer","version":"v1","payload":{"roomId":"${state.roomId}","questionId":"${state.questionId}","answerIndex":$answerIndex,"clientSentAt":"${System.currentTimeMillis()}"}}"""
    )
  }

  init {
    viewModelScope.launch {
      webSocketManager.events.collect { rawEvent ->
        if (rawEvent.contains("round:question_started")) {
          _uiState.value = GameUiState.ActiveQuestion(
            roomId = "demo-room",
            roundId = "round-1",
            questionId = "question-1",
            prompt = "Which layer should own timer authority in Royale Showdown?",
            answers = listOf("Android client", "Backend server", "Redis", "Browser tab"),
            timeLimitMs = 10_000,
            players = listOf(
              PlayerUiModel("1", "Ada", 920, 3, false),
              PlayerUiModel("2", "Turing", 850, 2, false)
            ),
            phaseLabel = "QUESTION_ACTIVE"
          )
        }

        if (rawEvent.contains("round:result")) {
          _uiState.value = GameUiState.RoundResult(
            roomId = "demo-room",
            summary = "Backend server controls truth for answer timing.",
            players = listOf(
              PlayerUiModel("1", "Ada", 1120, 4, false),
              PlayerUiModel("2", "Turing", 850, 0, false)
            )
          )
        }
      }
    }
  }
}
