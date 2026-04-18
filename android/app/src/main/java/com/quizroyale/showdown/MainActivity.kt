package com.quizroyale.showdown

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.hilt.navigation.compose.hiltViewModel
import com.quizroyale.showdown.ui.game.GameScreen
import com.quizroyale.showdown.ui.game.GameViewModel
import com.quizroyale.showdown.ui.lobby.LobbyScreen
import com.quizroyale.showdown.ui.theme.QuizRoyaleTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContent {
      QuizRoyaleTheme {
        val viewModel: GameViewModel = hiltViewModel()
        val state by viewModel.uiStateFlow.collectAsState()
        var inGame by mutableStateOf(false)

        if (inGame) {
          GameScreen(
            state = state,
            onAnswerSelected = viewModel::submitAnswer
          )
        } else {
          LobbyScreen(
            onJoinRoom = {
              viewModel.joinRoom(it)
              inGame = true
            }
          )
        }
      }
    }
  }
}
