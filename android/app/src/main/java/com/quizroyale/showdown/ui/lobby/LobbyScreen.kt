package com.quizroyale.showdown.ui.lobby

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@Composable
fun LobbyScreen(
  roomCode: String,
  onGameStarted: (String) -> Unit,
  viewModel: LobbyViewModel = hiltViewModel()
) {
  val uiState by viewModel.uiState.collectAsState()

  LaunchedEffect(viewModel) {
    viewModel.navigationEvents.collect { roomId ->
      onGameStarted(roomId)
    }
  }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(MaterialTheme.colorScheme.background)
      .padding(24.dp),
    verticalArrangement = Arrangement.spacedBy(20.dp)
  ) {
    Text(text = "Lobby — ${uiState.roomCode.ifBlank { roomCode }}", style = MaterialTheme.typography.headlineMedium)

    if (uiState.error != null) {
      Text(
        text = uiState.error!!,
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.bodyMedium
      )
    }

    if (uiState.countdownSeconds != null && uiState.countdownSeconds!! > 0) {
      Text(
        text = "Game starts in ${uiState.countdownSeconds}s…",
        style = MaterialTheme.typography.titleMedium
      )
    }

    Text(
      text = "Players (${uiState.players.size} / ${uiState.maxPlayers})",
      style = MaterialTheme.typography.titleSmall
    )

    LazyColumn(
      modifier = Modifier
        .weight(1f)
        .fillMaxWidth(),
      verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
      items(uiState.players) { player ->
        Card(modifier = Modifier.fillMaxWidth()) {
          Column(modifier = Modifier.padding(12.dp)) {
            Text(
              text = player.displayName,
              style = MaterialTheme.typography.bodyLarge
            )
          }
        }
      }
    }

    if (uiState.isHost && uiState.phase == "WAITING") {
      Button(
        onClick = { viewModel.onIntent(LobbyIntent.StartGame) },
        modifier = Modifier.fillMaxWidth()
      ) {
        Text("Start Game")
      }
    }
  }
}
