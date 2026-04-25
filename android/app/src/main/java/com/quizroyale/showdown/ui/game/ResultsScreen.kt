package com.quizroyale.showdown.ui.game

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.quizroyale.showdown.ui.theme.GameBackground
import com.quizroyale.showdown.ui.theme.GameCard
import com.quizroyale.showdown.ui.theme.GoldYellow

@Composable
fun ResultsScreen(
    players: List<PlayerUiModel>,
    onPlayAgain: () -> Unit,
    onHome: () -> Unit,
) {
    val sorted = players.sortedByDescending { it.score }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(GameBackground),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                text  = "Game Over",
                style = MaterialTheme.typography.displaySmall.copy(fontWeight = FontWeight.Black),
                color = GoldYellow,
            )

            if (sorted.isNotEmpty()) {
                Text(
                    text  = "Winner: ${sorted.first().displayName}",
                    style = MaterialTheme.typography.titleMedium,
                    color = Color.White,
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                itemsIndexed(sorted) { index, player ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors   = CardDefaults.cardColors(containerColor = GameCard),
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text  = rankEmoji(index),
                                    style = MaterialTheme.typography.titleLarge,
                                )
                                Text(
                                    text  = player.displayName,
                                    style = MaterialTheme.typography.titleMedium,
                                    color = if (player.isEliminated) Color.Gray else Color.White,
                                )
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text(
                                    text  = "${player.score} pts",
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                    color = GoldYellow,
                                )
                                if (player.xpAwarded > 0) {
                                    Text(
                                        text  = "+${player.xpAwarded} XP",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = Color(0xFF80CBC4),
                                    )
                                }
                            }
                        }
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Button(
                    onClick = onHome,
                    modifier = Modifier.weight(1f),
                    colors   = ButtonDefaults.buttonColors(containerColor = Color(0xFF2A2A40)),
                ) {
                    Text("Home", color = Color.White)
                }
                Button(
                    onClick = onPlayAgain,
                    modifier = Modifier.weight(1f),
                    colors   = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                ) {
                    Text("Play Again", color = Color.White)
                }
            }
        }
    }
}

private fun rankEmoji(index: Int): String = when (index) {
    0 -> "🥇"
    1 -> "🥈"
    2 -> "🥉"
    else -> "#${index + 1}"
}
