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
fun EliminatedScreen(
    onSpectate: () -> Unit,
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
            Text("Eliminated", style = MaterialTheme.typography.headlineLarge)
            Text("You answered incorrectly and were knocked out this round.")
            Text("Placement: Top 64")

            Button(onClick = onSpectate, modifier = Modifier.fillMaxWidth()) {
                Text("Spectate Results")
            }

            Button(onClick = onReturnHome, modifier = Modifier.fillMaxWidth()) {
                Text("Return Home")
            }
        }
    }
}