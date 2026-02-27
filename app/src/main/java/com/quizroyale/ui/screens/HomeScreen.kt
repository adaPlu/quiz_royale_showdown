package com.quizroyale.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
fun HomeScreen(
    onQuickMatch: () -> Unit,
    onProfile: () -> Unit,
    onLeaderboards: () -> Unit,
    onShop: () -> Unit,
    onSettings: () -> Unit
) {
    Scaffold { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "QuizRoyale",
                style = MaterialTheme.typography.headlineLarge
            )

            Text(
                text = "Fast trivia battle royale. Survive each round and outlast the lobby.",
                style = MaterialTheme.typography.bodyLarge
            )

            MenuButton("Quick Match", onQuickMatch)
            MenuButton("Tournament", onQuickMatch)
            MenuButton("Practice", onQuickMatch)
            MenuButton("Profile", onProfile)
            MenuButton("Leaderboards", onLeaderboards)
            MenuButton("Shop", onShop)
            MenuButton("Settings", onSettings)
        }
    }
}

@Composable
private fun MenuButton(label: String, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(vertical = 14.dp)
    ) {
        Text(label)
    }
}