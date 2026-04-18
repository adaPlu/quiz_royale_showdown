package com.quizroyale.showdown.ui.screens.results

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.quizroyale.showdown.domain.model.LeaderboardEntry

@Composable
fun ResultsScreen(
    onPlayAgain: () -> Unit,
    onHome: () -> Unit,
    viewModel: ResultsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(24.dp))
        Text(
            "Game Over!",
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.ExtraBold,
        )

        uiState.winner?.let {
            Spacer(Modifier.height(8.dp))
            Text(
                "Winner: ${it.displayName}",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.secondary,
            )
        }

        Spacer(Modifier.height(24.dp))
        Text("Final Standings", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(12.dp))

        LazyColumn(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            itemsIndexed(uiState.leaderboard) { index, entry ->
                LeaderboardRow(
                    rank = index + 1,
                    entry = entry,
                    isCurrentUser = entry.playerId == uiState.currentUserId,
                )
            }
        }

        uiState.xpEarned?.let { xp ->
            Spacer(Modifier.height(16.dp))
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    Modifier.padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text("XP Earned", style = MaterialTheme.typography.labelLarge)
                    Text(
                        "+$xp XP",
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.secondary,
                        fontWeight = FontWeight.ExtraBold,
                    )
                }
            }
        }

        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedButton(onClick = onHome, modifier = Modifier.weight(1f)) { Text("Home") }
            Button(onClick = onPlayAgain, modifier = Modifier.weight(1f)) { Text("Play Again") }
        }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun LeaderboardRow(rank: Int, entry: LeaderboardEntry, isCurrentUser: Boolean) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (isCurrentUser) MaterialTheme.colorScheme.primaryContainer
            else MaterialTheme.colorScheme.surface,
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = when (rank) { 1 -> "#1"; 2 -> "#2"; 3 -> "#3"; else -> "#$rank" },
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.width(40.dp),
            )
            Text(
                text = entry.displayName + if (isCurrentUser) " (You)" else "",
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "${entry.score} pts",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}
