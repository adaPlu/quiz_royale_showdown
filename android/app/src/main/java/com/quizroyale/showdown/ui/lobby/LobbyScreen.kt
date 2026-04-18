package com.quizroyale.showdown.ui.lobby

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun LobbyScreen(
  onJoinRoom: (String) -> Unit
) {
  var roomCode by rememberSaveable { mutableStateOf("ROYALE") }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(MaterialTheme.colorScheme.background)
      .padding(24.dp),
    verticalArrangement = Arrangement.spacedBy(20.dp)
  ) {
    Text(text = "Quiz Royale Showdown", style = MaterialTheme.typography.headlineMedium)
    Text(
      text = "Use this starter lobby to connect to the socket stub and enter the first playable room flow.",
      style = MaterialTheme.typography.bodyLarge
    )
    OutlinedTextField(
      value = roomCode,
      onValueChange = { roomCode = it.uppercase() },
      label = { Text("Room code") },
      modifier = Modifier.fillMaxWidth()
    )
    Button(onClick = { onJoinRoom(roomCode) }) {
      Text("Join Room")
    }
  }
}
