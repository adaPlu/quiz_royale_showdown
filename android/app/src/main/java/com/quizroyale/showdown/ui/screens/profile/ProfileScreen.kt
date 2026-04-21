package com.quizroyale.showdown.ui.screens.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage

private val Gold = Color(0xFFFFD700)
private val Brand = Color(0xFF6C3EF5)
private val Surface = Color(0xFF1A1A2E)
private val BgDark = Color(0xFF0E0E1A)

@Composable
fun ProfileScreen(
    onNavigateBack: () -> Unit = {},
    viewModel: ProfileViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BgDark)
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextButton(onClick = onNavigateBack) {
                Text("← Back", color = Color.White.copy(alpha = 0.6f))
            }
            Text(
                text = "Profile",
                color = Color.White,
                fontSize = 20.sp,
                fontWeight = FontWeight.Black,
                modifier = Modifier.padding(start = 8.dp)
            )
        }

        Spacer(Modifier.height(24.dp))

        when (val s = state) {
            is ProfileUiState.Loading -> CircularProgressIndicator(color = Brand)
            is ProfileUiState.Error -> Text(s.message, color = Color.Red)
            is ProfileUiState.Success -> ProfileContent(s)
        }
    }
}

@Composable
private fun ProfileContent(state: ProfileUiState.Success) {
    if (state.avatarUrl != null) {
        AsyncImage(
            model = state.avatarUrl,
            contentDescription = "Avatar",
            modifier = Modifier
                .size(96.dp)
                .clip(CircleShape)
                .background(Surface)
        )
    } else {
        Box(
            modifier = Modifier
                .size(96.dp)
                .clip(CircleShape)
                .background(Brand),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = state.displayName.take(1).uppercase(),
                color = Color.White,
                fontSize = 36.sp,
                fontWeight = FontWeight.Black
            )
        }
    }

    Spacer(Modifier.height(12.dp))

    Text(state.displayName, color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Black)

    Spacer(Modifier.height(4.dp))

    // Level badge
    Surface(
        color = Gold.copy(alpha = 0.15f),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.padding(4.dp)
    ) {
        Text(
            text = "Level ${state.level}",
            color = Gold,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)
        )
    }

    Spacer(Modifier.height(16.dp))

    // XP bar
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("XP", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp)
            Text("${state.xp} / ${state.xpToNextLevel}", color = Gold, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(4.dp))
        val progress = if (state.xpToNextLevel > 0) state.xp.toFloat() / state.xpToNextLevel else 0f
        LinearProgressIndicator(
            progress = { progress.coerceIn(0f, 1f) },
            modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)),
            color = Brand,
            trackColor = Surface
        )
    }

    Spacer(Modifier.height(24.dp))

    // Stats grid
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        StatCard(label = "Wins", value = state.wins.toString(), modifier = Modifier.weight(1f))
        StatCard(label = "Games", value = state.gamesPlayed.toString(), modifier = Modifier.weight(1f))
        StatCard(label = "Win Rate", value = if (state.gamesPlayed > 0) "${(state.wins * 100 / state.gamesPlayed)}%" else "—", modifier = Modifier.weight(1f))
    }
}

@Composable
private fun StatCard(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .background(Surface, RoundedCornerShape(16.dp))
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(value, color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Black)
        Text(label, color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp)
    }
}
