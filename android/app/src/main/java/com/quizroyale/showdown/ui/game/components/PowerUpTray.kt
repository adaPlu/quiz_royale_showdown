package com.quizroyale.showdown.ui.game.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreTime
import androidx.compose.material.icons.filled.PersonRemove
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.StarRate
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quizroyale.showdown.domain.model.PowerupType
import com.quizroyale.showdown.ui.game.OwnedPowerup
import com.quizroyale.showdown.ui.theme.BrandPurple
import com.quizroyale.showdown.ui.theme.GameBorder
import com.quizroyale.showdown.ui.theme.GameCard
import com.quizroyale.showdown.ui.theme.GameMuted
import com.quizroyale.showdown.ui.theme.GoldYellow

// ── Icon + label mappings ─────────────────────────────────────────────────────

private fun PowerupType.icon(): ImageVector = when (this) {
    PowerupType.DOUBLE_POINTS  -> Icons.Default.StarRate
    PowerupType.EXTRA_TIME     -> Icons.Default.MoreTime
    PowerupType.ELIMINATE_TWO  -> Icons.Default.PersonRemove
    PowerupType.SHIELD         -> Icons.Default.Shield
}

private fun PowerupType.label(): String = when (this) {
    PowerupType.DOUBLE_POINTS  -> "2× PTS"
    PowerupType.EXTRA_TIME     -> "TIME+"
    PowerupType.ELIMINATE_TWO  -> "ELIM×2"
    PowerupType.SHIELD         -> "SHIELD"
}

// ── Public composable ─────────────────────────────────────────────────────────

/**
 * Horizontal row showing up to 4 power-up slots.
 *
 * Each slot displays:
 * - An [IconButton] with the power-up icon
 * - A small quantity badge overlaid on the icon
 * - A short name label below the button
 *
 * A slot is disabled (grayed out, strikethrough label) when:
 * - [OwnedPowerup.quantity] == 0, OR
 * - [OwnedPowerup.usedThisRound] == true
 *
 * @param powerups   List of power-ups to display (max 4 shown).
 * @param onActivate Called with the [PowerupType] when the player taps an active slot.
 * @param modifier   Optional modifier.
 */
@Composable
fun PowerUpTray(
    powerups: List<OwnedPowerup>,
    onActivate: (PowerupType) -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = GameCard),
        border = androidx.compose.foundation.BorderStroke(1.dp, GameBorder),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            powerups.take(4).forEach { owned ->
                PowerUpSlot(
                    owned = owned,
                    onActivate = onActivate,
                )
            }
        }
    }
}

// ── Private slot composable ───────────────────────────────────────────────────

@Composable
private fun PowerUpSlot(
    owned: OwnedPowerup,
    onActivate: (PowerupType) -> Unit,
) {
    val isDisabled = owned.quantity <= 0 || owned.usedThisRound
    val iconTint   = if (isDisabled) GameMuted else when (owned.type) {
        PowerupType.DOUBLE_POINTS -> GoldYellow
        PowerupType.SHIELD        -> Color(0xFF60A5FA) // light blue
        else                      -> BrandPurple
    }
    val alpha = if (isDisabled) 0.45f else 1f

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        // Icon button with quantity badge overlay
        Box {
            IconButton(
                onClick = { if (!isDisabled) onActivate(owned.type) },
                enabled = !isDisabled,
                modifier = Modifier
                    .size(52.dp)
                    .alpha(alpha)
                    .background(
                        color = if (isDisabled) GameCard else iconTint.copy(alpha = 0.12f),
                        shape = CircleShape,
                    )
                    .border(
                        width = 1.5.dp,
                        color = if (isDisabled) GameBorder else iconTint.copy(alpha = 0.5f),
                        shape = CircleShape,
                    ),
            ) {
                Icon(
                    imageVector = owned.type.icon(),
                    contentDescription = owned.type.label(),
                    tint = iconTint,
                    modifier = Modifier.size(26.dp),
                )
            }

            // Quantity badge — only shown when there is at least 1 charge
            if (owned.quantity > 0) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .offset(x = 2.dp, y = (-2).dp)
                        .size(18.dp)
                        .background(
                            color = if (isDisabled) GameMuted else BrandPurple,
                            shape = CircleShape,
                        ),
                ) {
                    Text(
                        text = owned.quantity.coerceAtMost(9).toString(),
                        color = Color.White,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        lineHeight = 10.sp,
                    )
                }
            }
        }

        // Label — strikethrough when disabled
        Text(
            text = owned.type.label(),
            style = MaterialTheme.typography.labelSmall.copy(
                textDecoration = if (isDisabled) TextDecoration.LineThrough else TextDecoration.None,
                color = if (isDisabled) GameMuted else LocalContentColor.current,
            ),
            fontSize = 9.sp,
        )
    }
}
