package com.quizroyale.showdown.ui.screens.cosmetics

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel

private val Gold = Color(0xFFFFD700)
private val Brand = Color(0xFF6C3EF5)
private val Surface = Color(0xFF1A1A2E)
private val BgDark = Color(0xFF0E0E1A)

@Composable
fun CosmeticsScreen(
    onNavigateBack: () -> Unit = {},
    viewModel: CosmeticsViewModel = hiltViewModel()
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
                "Cosmetics",
                color = Color.White,
                fontSize = 20.sp,
                fontWeight = FontWeight.Black,
                modifier = Modifier.padding(start = 8.dp)
            )
        }

        Spacer(Modifier.height(12.dp))

        when (val s = state) {
            is CosmeticsUiState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Brand)
            }
            is CosmeticsUiState.Error -> Text(s.message, color = Color.Red, modifier = Modifier.padding(16.dp))
            is CosmeticsUiState.Success -> CosmeticsGrid(s, viewModel::equip)
        }
    }
}

@Composable
private fun CosmeticsGrid(state: CosmeticsUiState.Success, onEquip: (String) -> Unit) {
    if (state.cosmetics.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("No cosmetics available yet.", color = Color.White.copy(alpha = 0.4f))
        }
        return
    }

    LazyVerticalGrid(
        columns = GridCells.Fixed(3),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        items(state.cosmetics) { item ->
            CosmeticCard(item = item, onClick = { if (item.owned) onEquip(item.id) })
        }
    }
}

@Composable
private fun CosmeticCard(item: CosmeticItem, onClick: () -> Unit) {
    val borderColor = when {
        item.equipped -> Gold
        item.owned -> Brand
        else -> Color.White.copy(alpha = 0.1f)
    }

    Box(
        modifier = Modifier
            .aspectRatio(1f)
            .clip(RoundedCornerShape(16.dp))
            .background(Surface)
            .border(width = if (item.equipped) 2.dp else 1.dp, color = borderColor, shape = RoundedCornerShape(16.dp))
            .clickable(enabled = item.owned, onClick = onClick)
            .alpha(if (item.owned) 1f else 0.4f)
            .padding(10.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(text = item.emoji, fontSize = 28.sp)
            Text(
                text = item.name,
                color = Color.White,
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                maxLines = 2
            )
            if (item.equipped) {
                Text("Equipped", color = Gold, fontSize = 9.sp, fontWeight = FontWeight.Bold)
            } else if (!item.owned) {
                Text("Locked", color = Color.White.copy(alpha = 0.4f), fontSize = 9.sp)
            }
        }
    }
}
