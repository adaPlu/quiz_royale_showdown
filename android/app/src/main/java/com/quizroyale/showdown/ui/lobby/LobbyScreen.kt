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
import androidx.compose.material3.FilterChip
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
import com.quizroyale.showdown.data.room.GameDifficulty

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
    val isHost = liveRoom?.hostUserId != null && liveRoom.hostUserId == uiState.currentUserId
    val hostName = liveRoom?.players
        ?.firstOrNull { it.id == liveRoom.hostUserId }
        ?.displayName
        ?: "the room host"

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
                    Text(if (isHost) "HOST" else if (liveRoom != null) "Live" else "Cached")
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
                liveRoom?.let { room ->
                    Text(
                        text = "Difficulty ${room.difficulty.name.lowercase().replaceFirstChar { it.uppercase() }}",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
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
                                    if (player.id == liveRoom.hostUserId) {
                                        append(" - HOST")
                                    }
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

        liveRoom?.let { room ->
            ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text("Game Controls", style = MaterialTheme.typography.titleMedium)
                    Text(
                        text = if (isHost) "You are the host and control this room." else "$hostName is the host",
                        style = MaterialTheme.typography.bodyMedium,
                    )

                    if (room.phase == "WAITING" && isHost) {
                        Text("Question Difficulty", style = MaterialTheme.typography.titleMedium)
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            GameDifficulty.entries.forEach { difficulty ->
                                FilterChip(
                                    selected = room.difficulty == difficulty,
                                    onClick = { viewModel.setDifficulty(difficulty) },
                                    enabled = !uiState.isSavingDifficulty && !uiState.isStartingGame,
                                    label = {
                                        Text(
                                            difficulty.name.lowercase().replaceFirstChar { it.uppercase() }
                                        )
                                    },
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }
                        Text(
                            text = when (room.difficulty) {
                                GameDifficulty.EASY -> "Easy questions only"
                                GameDifficulty.MEDIUM -> "A mix of easy and medium questions"
                                GameDifficulty.HARD -> "A mix of medium and hard questions"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.Gray,
                        )

                        val isSolo = room.totalPlayers == 1
                        Text(
                            text = if (isSolo) "Single Player Mode" else "Multiplayer Mode",
                            style = MaterialTheme.typography.titleLarge,
                        )
                        Button(
                            onClick = { viewModel.startGame(allowSolo = isSolo) },
                            enabled = !uiState.isStartingGame && !uiState.isSavingDifficulty,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            if (uiState.isStartingGame) {
                                CircularProgressIndicator(strokeWidth = 2.dp, color = Color.White)
                            } else {
                                Text(if (isSolo) "Play Solo" else "Start Multiplayer")
                            }
                        }
                    } else if (!isHost) {
                        Text(
                            text = "Waiting for $hostName to choose difficulty and start the game.",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.Gray,
                        )
                    } else {
                        Text(
                            text = "Phase ${room.phase}. The game is starting or already in progress.",
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
