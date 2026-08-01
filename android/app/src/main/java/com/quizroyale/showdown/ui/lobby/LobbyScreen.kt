package com.quizroyale.showdown.ui.lobby

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@Composable
fun LobbyScreen(
    onNavigateHome: () -> Unit,
    onOpenGameplay: (String) -> Unit,
    viewModel: LobbyViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val liveRoom = uiState.room
    val cachedRoom = uiState.cachedRoom
    val roomReference = liveRoom?.roomReference ?: cachedRoom?.roomReference

    LaunchedEffect(uiState.gameStarted) {
        if (uiState.gameStarted) {
            liveRoom?.roomCode?.let(onOpenGameplay)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Lobby", style = MaterialTheme.typography.displaySmall)
                Text(
                    text = roomReference ?: "Waiting for room selection",
                    style = MaterialTheme.typography.titleLarge,
                )
            }
            AssistChip(
                onClick = {},
                label = {
                    Text(if (liveRoom != null) "Live" else "Cached")
                },
            )
        }

        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                val phase = liveRoom?.phase ?: cachedRoom?.phase ?: "UNKNOWN"
                val roundNumber = liveRoom?.roundNumber ?: cachedRoom?.roundNumber ?: 0
                val totalRounds = liveRoom?.totalRounds ?: cachedRoom?.totalRounds ?: 10
                val totalPlayers = liveRoom?.totalPlayers ?: 0

                Text("Room State", style = MaterialTheme.typography.titleMedium)
                Text("Phase $phase", style = MaterialTheme.typography.bodyLarge)
                Text(
                    text = "Round $roundNumber / $totalRounds",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    text = "Players $totalPlayers",
                    style = MaterialTheme.typography.bodyMedium,
                )
                if (liveRoom?.maxPlayers != null) {
                    Text(
                        text = "Capacity ${liveRoom.maxPlayers}",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
                if (uiState.isLoading) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        CircularProgressIndicator(strokeWidth = 2.dp)
                        Text(
                            text = "Refreshing room state from the backend...",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
            }
        }

        liveRoom?.players
            ?.takeIf { it.isNotEmpty() }
            ?.let { players ->
                ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Text("Players", style = MaterialTheme.typography.titleMedium)
                        players.forEach { player ->
                            Text(
                                text = buildString {
                                    append(player.displayName)
                                    append(" - ")
                                    append(player.score)
                                    append(" pts")
                                    if (player.isEliminated) {
                                        append(" - Eliminated")
                                    }
                                },
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                }
            }

        val errorMessage = uiState.errorMessage
        if (errorMessage != null) {
            ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = errorMessage,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    TextButton(onClick = viewModel::dismissError) {
                        Text("Dismiss")
                    }
                }
            }
        }

        if (liveRoom?.phase == "WAITING") {
            ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text("Ready to play?", style = MaterialTheme.typography.titleMedium)
                    Button(
                        onClick = viewModel::startGame,
                        enabled = !uiState.isStartingGame && liveRoom.totalPlayers >= 2,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        if (uiState.isStartingGame) {
                            CircularProgressIndicator(strokeWidth = 2.dp, color = Color.White)
                        } else {
                            Text("Start Game")
                        }
                    }
                    if (liveRoom.totalPlayers < 2) {
                        Text(
                            text = "Need at least 2 players to start",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.Gray,
                        )
                    }
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedButton(
                onClick = viewModel::refreshRoom,
                modifier = Modifier.weight(1f),
            ) {
                Text("Refresh")
            }
            OutlinedButton(
                onClick = {
                    viewModel.leaveForHome()
                    onNavigateHome()
                },
                modifier = Modifier.weight(1f),
            ) {
                Text("Back Home")
            }
        }

        Spacer(modifier = Modifier.height(12.dp))
    }
}
