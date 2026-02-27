package com.quizroyale

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.quizroyale.navigation.AppNavGraph
import com.quizroyale.ui.theme.QuizRoyaleTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            QuizRoyaleTheme {
                AppNavGraph()
            }
        }
    }
}