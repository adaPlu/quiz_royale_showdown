package com.quizroyale.showdown.ui.screens.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@Composable
fun HomeScreen(
    onNavigateToLobby: (roomId: String) -> Unit,
    onNavigateToProfile: () -> Unit = {},
    onNavigateToLeaderboard: () -> Unit = {},
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    var roomCode by remember { mutableStateOf("") }

    LaunchedEffect(uiState.navigateToRoomId) {
        uiState.navigateToRoomId?.let {
            onNavigateToLobby(it)
            viewModel.onNavigated()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            "Quiz Royale",
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.ExtraBold,
            color = MaterialTheme.colorScheme.primary,
        )
        Text("Showdown", style = MaterialTheme.typography.headlineMedium)

        Spacer(Modifier.height(8.dp))
        uiState.username?.let { Text("Welcome, $it!", style = MaterialTheme.typography.bodyLarge) }

        Spacer(Modifier.height(40.dp))

        // Quick Play
        Button(
            onClick = { viewModel.quickPlay() },
            enabled = !uiState.isLoading,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            shape = RoundedCornerShape(16.dp),
        ) {
            Text("Quick Play", fontWeight = FontWeight.Bold)
        }

        Spacer(Modifier.height(12.dp))

        // Create Private Room
        OutlinedButton(
            onClick = { viewModel.createRoom() },
            enabled = !uiState.isLoading,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            shape = RoundedCornerShape(16.dp),
        ) {
            Text("Create Private Room")
        }

        Spacer(Modifier.height(24.dp))
        HorizontalDivider()
        Spacer(Modifier.height(24.dp))

        // Join by code
        OutlinedTextField(
            value = roomCode,
            onValueChange = { roomCode = it.uppercase().take(8) },
            label = { Text("Room Code") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))
        Button(
            onClick = { viewModel.joinByCode(roomCode) },
            enabled = roomCode.length >= 4 && !uiState.isLoading,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Join Room") }

        uiState.error?.let {
            Spacer(Modifier.height(12.dp))
            Text(
                it,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
        }

        Spacer(Modifier.height(32.dp))
        TextButton(onClick = onNavigateToProfile) { Text("My Profile") }
        TextButton(onClick = onNavigateToLeaderboard) { Text("Leaderboard") }
    }
}
