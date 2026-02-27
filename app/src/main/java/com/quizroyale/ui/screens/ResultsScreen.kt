package com.quizroyale.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun ResultsScreen(
    onPlayAgain: () -> Unit,
    onReturnHome: () -> Unit
) {
    Scaffold { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text("Match Results", style = MaterialTheme.typography.headlineLarge)
            Text("Rank: #1")
            Text("XP Earned: 120")
            Text("Coins Earned: 35")
            Text("Reward: Bronze Trivia Crate")

            Button(onClick = onPlayAgain, modifier = Modifier.fillMaxWidth()) {
                Text("Play Again")
            }

            Button(onClick = onReturnHome, modifier = Modifier.fillMaxWidth()) {
                Text("Return Home")
            }
        }
    }
}