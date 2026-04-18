package com.quizroyale.showdown.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val RoyaleDarkColors = darkColorScheme(
  primary = Color(0xFF6C3EF5),
  secondary = Color(0xFFFFD700),
  background = Color(0xFF0E0E1A),
  surface = Color(0xFF18182A),
  onPrimary = Color.White,
  onBackground = Color.White,
  onSurface = Color.White
)

@Composable
fun QuizRoyaleTheme(content: @Composable () -> Unit) {
  MaterialTheme(
    colorScheme = RoyaleDarkColors,
    content = content
  )
}
