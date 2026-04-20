package com.quizroyale.showdown.ui.game.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

data class OwnedPowerup(
    val code: String,
    val label: String,
    val icon: String,
    val quantity: Int,
    val usedThisRound: Boolean,
)

private val Brand = Color(0xFF6C3EF5)
private val Gold = Color(0xFFFFD700)

@Composable
fun PowerUpTray(
    powerups: List<OwnedPowerup>,
    onActivate: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        powerups.forEach { slot ->
            val active = slot.quantity > 0 && !slot.usedThisRound
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .alpha(if (active) 1f else 0.38f)
                    .clip(RoundedCornerShape(14.dp))
                    .background(if (active) Brand else Color(0x226C3EF5))
                    .border(
                        width = 1.dp,
                        color = if (active) Gold else Color(0x22FFFFFF),
                        shape = RoundedCornerShape(14.dp),
                    )
                    .then(if (active) Modifier.clickable { onActivate(slot.code) } else Modifier),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(slot.icon, color = Color.White, fontWeight = FontWeight.Black, fontSize = 11.sp)
                    Text(slot.label, color = Gold, fontWeight = FontWeight.Bold, fontSize = 7.sp)
                }
                if (slot.quantity > 1) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(3.dp)
                            .size(14.dp)
                            .background(Gold, RoundedCornerShape(7.dp)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("${slot.quantity}", color = Color.Black, fontSize = 8.sp, fontWeight = FontWeight.Black)
                    }
                }
                if (slot.usedThisRound) {
                    Box(
                        modifier = Modifier
                            .matchParentSize()
                            .background(Color(0x99000000), RoundedCornerShape(14.dp)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("USED", color = Color.White, fontSize = 7.sp, fontWeight = FontWeight.Black)
                    }
                }
            }
        }
    }
}
