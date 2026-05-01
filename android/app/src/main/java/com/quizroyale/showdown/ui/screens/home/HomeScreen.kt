package com.quizroyale.showdown.ui.screens.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@Composable
fun HomeScreen(
    onNavigateToLobby: (String) -> Unit,
    onLogoutComplete: () -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(uiState.navigateToLobby) {
        val roomReference = uiState.navigateToLobby ?: return@LaunchedEffect
        onNavigateToLobby(roomReference)
        viewModel.onNavigationHandled()
    }

    LaunchedEffect(uiState.navigateToLogin) {
        if (uiState.navigateToLogin) {
            onLogoutComplete()
            viewModel.onNavigationHandled()
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
        ) {
            Text(
                text = "Room Hub",
                style = MaterialTheme.typography.displaySmall,
            )
            TextButton(onClick = viewModel::logout) {
                Text("Logout")
            }
        }
        Text(
            text = "Create a room, join by code, or jump back into your latest lobby.",
            style = MaterialTheme.typography.bodyLarge,
        )

        uiState.recentRoom?.let { recentRoom ->
            ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("Recent Room", style = MaterialTheme.typography.titleMedium)
                    Text(
                        text = recentRoom.roomReference,
                        style = MaterialTheme.typography.headlineSmall,
                    )
                    Text(
                        text = "Phase ${recentRoom.phase} - Round ${recentRoom.roundNumber}/${recentRoom.totalRounds}",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    TextButton(
                        onClick = viewModel::resumeRecentRoom,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Return to Lobby")
                    }
                }
            }
        }

        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("Create a Room", style = MaterialTheme.typography.titleMedium)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Button(
                        onClick = viewModel::createOpenRoom,
                        enabled = uiState.activeAction == null,
                        modifier = Modifier.weight(1f),
                    ) {
                        ActionLabel(
                            isLoading = uiState.activeAction == HomeAction.CREATE_OPEN,
                            label = "Open Room",
                        )
                    }
                    Button(
                        onClick = viewModel::createPrivateRoom,
                        enabled = uiState.activeAction == null,
                        modifier = Modifier.weight(1f),
                    ) {
                        ActionLabel(
                            isLoading = uiState.activeAction == HomeAction.CREATE_PRIVATE,
                            label = "Private Room",
                        )
                    }
                }
            }
        }

        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("Join by Code", style = MaterialTheme.typography.titleMedium)
                OutlinedTextField(
                    value = uiState.joinCode,
                    onValueChange = viewModel::onJoinCodeChange,
                    label = { Text("Room Code") },
                    supportingText = { Text("Use the room code shared by the host.") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                Button(
                    onClick = viewModel::joinByCode,
                    enabled = uiState.activeAction == null,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    ActionLabel(
                        isLoading = uiState.activeAction == HomeAction.JOIN_BY_CODE,
                        label = "Join Room",
                    )
                }
            }
        }

        val errorMessage = uiState.errorMessage
        if (errorMessage != null) {
            Text(
                text = errorMessage,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(modifier = Modifier.height(4.dp))
            TextButton(onClick = viewModel::dismissError) {
                Text("Dismiss")
            }
        }
    }
}

@Composable
private fun ActionLabel(
    isLoading: Boolean,
    label: String,
) {
    if (isLoading) {
        CircularProgressIndicator(
            modifier = Modifier.size(18.dp),
            strokeWidth = 2.dp,
        )
    } else {
        Text(label)
    }
}
