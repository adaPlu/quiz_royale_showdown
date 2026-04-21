package com.quizroyale.showdown.ui.screens.leaderboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel

private val Gold = Color(0xFFFFD700)
private val Brand = Color(0xFF6C3EF5)
private val Surface = Color(0xFF1A1A2E)
private val BgDark = Color(0xFF0E0E1A)
private val Border = Color(0xFF2D2D4A)

@Composable
fun LeaderboardScreen(
    onNavigateBack: () -> Unit = {},
    viewModel: LeaderboardViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BgDark)
            .padding(16.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onNavigateBack) {
                Text("← Back", color = Color.White.copy(alpha = 0.6f))
            }
            Text(
                text = "Leaderboard",
                color = Color.White,
                fontSize = 20.sp,
                fontWeight = FontWeight.Black,
                modifier = Modifier.padding(start = 8.dp)
            )
        }

        Spacer(Modifier.height(12.dp))

        // Tab row
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            LeaderboardTab.entries.forEach { tab ->
                FilterChip(
                    selected = state.activeTab == tab,
                    onClick = { viewModel.setTab(tab) },
                    label = { Text(tab.label) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = Brand,
                        selectedLabelColor = Color.White,
                        containerColor = Surface,
                        labelColor = Color.White.copy(alpha = 0.5f)
                    )
                )
            }
        }

        Spacer(Modifier.height(16.dp))

        when {
            state.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Brand)
            }
            state.entries.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No data yet. Play a game!", color = Color.White.copy(alpha = 0.4f))
            }
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                itemsIndexed(state.entries) { index, entry ->
                    LeaderboardRow(rank = index + 1, entry = entry)
                }
            }
        }
    }
}

@Composable
private fun LeaderboardRow(rank: Int, entry: LeaderboardEntry) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Surface, RoundedCornerShape(16.dp))
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = when (rank) { 1 -> "🥇"; 2 -> "🥈"; 3 -> "🥉"; else -> "$rank" },
            color = if (rank <= 3) Gold else Color.White.copy(alpha = 0.4f),
            fontWeight = FontWeight.Bold,
            modifier = Modifier.width(32.dp)
        )
        Box(
            modifier = Modifier
                .size(40.dp)
                .background(Brand, RoundedCornerShape(12.dp)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = entry.displayName.take(1).uppercase(),
                color = Color.White,
                fontWeight = FontWeight.Black,
                fontSize = 16.sp
            )
        }
        Text(
            text = entry.displayName,
            color = Color.White,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(1f),
            maxLines = 1
        )
        Text(
            text = entry.scoreLabel,
            color = Gold,
            fontWeight = FontWeight.Bold,
            fontSize = 14.sp
        )
    }
}
