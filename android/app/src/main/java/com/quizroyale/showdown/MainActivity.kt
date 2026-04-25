package com.quizroyale.showdown

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.quizroyale.showdown.ui.navigation.QuizRoyaleNavHost
import com.quizroyale.showdown.ui.theme.QuizRoyaleTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContent {
      QuizRoyaleTheme {
        QuizRoyaleNavHost()
      }
    }
  }
}
