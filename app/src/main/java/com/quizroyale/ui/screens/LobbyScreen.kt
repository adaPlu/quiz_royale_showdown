package com.quizroyale.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

@Composable
fun LobbyScreen(
    onBack: () -> Unit,
    onMatchReady: () -> Unit
) {
    var playerCount by remember { mutableIntStateOf(12) }
    var countdown by remember { mutableIntStateOf(5) }

    LaunchedEffect(Unit) {
        repeat(4) {
            delay(700)
            playerCount += 18
        }

        while (countdown > 0) {
            delay(1000)
            countdown--
        }

        onMatchReady()
    }

    Scaffold { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text("Match Lobby", style = MaterialTheme.typography.headlineMedium)
            Text("Players joined: $playerCount / 100")
            LinearProgressIndicator(
                progress = { playerCount / 100f },
                modifier = Modifier.fillMaxWidth()
            )

            Text("Match starts in: $countdown")
            Text("Tip: Save your power-ups for late rounds.")
            Text("Tip: Wrong answers can eliminate you.")

            Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
                Text("Leave Queue")
            }
        }
    }
}