package com.quizroyale.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.quizroyale.viewmodel.MatchUiState
import com.quizroyale.viewmodel.MatchViewModel

@Composable
fun GameScreen(vm: MatchViewModel = viewModel()) {
  val state by vm.state.collectAsState()

  Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
    Text("Quiz Royale Showdown", style = MaterialTheme.typography.headlineSmall)

    when (val s = state) {
      is MatchUiState.Disconnected -> {
        Button(onClick = vm::connect) { Text("Connect") }
      }

      is MatchUiState.Connecting -> {
        Text("Connecting…")
      }

      is MatchUiState.Queueing -> {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          Button(onClick = vm::joinQuickMatch) { Text("Quick Match") }
          OutlinedButton(onClick = vm::disconnect) { Text("Disconnect") }
        }
        Text("Queueing… players waiting: ${s.playersInQueue}")
        Text("Tip: Run a 2nd emulator to reach threshold=2.")
      }

      is MatchUiState.Lobby -> {
        Text("Lobby")
        Text("Match: ${s.matchId.take(8)}…  Players: ${s.players}")
        Text("Starting soon… (server sets start time)")
        OutlinedButton(onClick = vm::disconnect) { Text("Disconnect") }
      }

      is MatchUiState.InRound -> {
        Text("Round ${s.round}")
        Text(s.question.text, style = MaterialTheme.typography.titleMedium)

        s.question.choices.forEach { c ->
          Button(
            onClick = { vm.submitAnswer(c.id) },
            modifier = Modifier.fillMaxWidth()
          ) { Text(c.text) }
        }
      }

      is MatchUiState.RoundResult -> {
        Text(if (s.alive) "✅ You’re still in!" else "❌ Eliminated")
        Text("Correct answer id: ${s.correctChoiceId}")
        Text("Players alive: ${s.playersAlive}")
        Text("Waiting for next round…")
      }

      is MatchUiState.Ended -> {
        Text("Match Ended")
        Text("Final rank: ${s.finalRank}")
        Text("Rewards: +${s.xp} XP, +${s.coins} coins")
        Button(onClick = vm::joinQuickMatch) { Text("Play again") }
        OutlinedButton(onClick = vm::disconnect) { Text("Disconnect") }
      }

      is MatchUiState.Error -> {
        Text("Error: ${s.message}")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          Button(onClick = vm::connect) { Text("Reconnect") }
          OutlinedButton(onClick = vm::disconnect) { Text("Disconnect") }
        }
      }
    }
  }
}