package com.quizroyale.showdown.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColorScheme = darkColorScheme(
    primary          = BrandPurple,
    onPrimary        = Color.White,
    primaryContainer = Color(0xFF3B1FA0),
    secondary        = GoldYellow,
    background       = GameBackground,
    surface          = GameSurface,
    surfaceVariant   = GameCard,
    outline          = GameBorder,
    onSurface        = Color.White,
    onBackground     = Color.White,
    error            = AnswerWrong,
)

@Composable
fun QuizRoyaleTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography  = Typography,
        content     = content,
    )
}
