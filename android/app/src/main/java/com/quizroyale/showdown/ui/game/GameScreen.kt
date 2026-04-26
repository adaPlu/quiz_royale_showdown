package com.quizroyale.showdown.ui.game

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.Spacer
import com.quizroyale.showdown.domain.model.PowerupType
import com.quizroyale.showdown.ui.game.components.PowerUpTray
import com.quizroyale.showdown.ui.theme.AnswerCorrect
import com.quizroyale.showdown.ui.theme.AnswerLocked
import com.quizroyale.showdown.ui.theme.GameBackground
import com.quizroyale.showdown.ui.theme.GameCard
import com.quizroyale.showdown.ui.theme.GoldYellow
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow

// ── Loot-drop banner state ────────────────────────────────────────────────────

private fun PowerupType.displayName(): String = when (this) {
    PowerupType.DOUBLE_POINTS -> "DOUBLE POINTS"
    PowerupType.EXTRA_TIME    -> "TIME BOOST"
    PowerupType.ELIMINATE_TWO -> "ELIMINATOR"
    PowerupType.SHIELD        -> "SHIELD"
}

// ── Main screen ───────────────────────────────────────────────────────────────

@Composable
fun GameScreen(
    state: GameUiState,
    onAnswerSelected: (Int) -> Unit,
    sideEffects: Flow<GameSideEffect>? = null,
    onIntent: ((GameIntent) -> Unit)? = null,
    isReconnecting: Boolean = false,
    onNavigateToResults: ((String) -> Unit)? = null,
) {
    val context = LocalContext.current
    val haptic  = LocalHapticFeedback.current

    // Sound manager — created once, released on composition exit
    val soundManager = remember { GameSoundManager(context) }
    DisposableEffect(Unit) {
        onDispose { soundManager.release() }
    }

    // Snackbar for level-up / toast side effects
    val snackbarHostState = remember { SnackbarHostState() }

    // Loot-drop banner state
    var lootDropVisible by remember { mutableStateOf(false) }
    var lootDropText    by remember { mutableStateOf("") }

    // Collect side effects
    LaunchedEffect(sideEffects) {
        sideEffects?.collect { effect ->
            when (effect) {
                is GameSideEffect.AnswerSubmitted -> {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                }
                is GameSideEffect.CorrectAnswerRevealed -> {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    soundManager.playCorrect()
                }
                is GameSideEffect.PlayerEliminated -> {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    soundManager.playElimination()
                }
                is GameSideEffect.NavigateToResults -> {
                    soundManager.playVictory()
                    onNavigateToResults?.invoke(effect.roomId)
                }
                is GameSideEffect.ShowLevelUp -> {
                    snackbarHostState.showSnackbar("Level up! You reached level ${effect.newLevel}")
                }
                is GameSideEffect.ShowToast -> {
                    snackbarHostState.showSnackbar(effect.message)
                }
                is GameSideEffect.ShowLootDrop -> {
                    lootDropText    = "🎁 You got: ${effect.powerupType.displayName()}!"
                    lootDropVisible = true
                    soundManager.playPowerup()
                    delay(2_500)
                    lootDropVisible = false
                }
                is GameSideEffect.HapticFeedback -> {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                }
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(GameBackground)
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp),
            horizontalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            // ── Left column: countdown + question/result + power-up tray ───────
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                CountdownRing(
                    timerSeconds = (state as? GameUiState.ActiveQuestion)?.timerSeconds ?: 0,
                    timeLimitMs = (state as? GameUiState.ActiveQuestion)?.timeLimitMs ?: 0,
                )

                when (state) {
                    is GameUiState.ActiveQuestion -> {
                        QuestionCard(
                            state        = state,
                            onAnswerSelected = { index ->
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                onAnswerSelected(index)
                            },
                        )

                        // Power-up tray — only visible in ActiveQuestion state
                        PowerUpTray(
                            powerups   = state.ownedPowerups,
                            onActivate = { type ->
                                soundManager.playPowerup()
                                onIntent?.invoke(GameIntent.UsePowerup(type))
                            },
                            modifier   = Modifier.fillMaxWidth(),
                        )
                    }

                    is GameUiState.RoundResult -> {
                        ResultCard(state.summary)
                    }

                    else -> {
                        ResultCard("Waiting for the next round.")
                    }
                }
            }

            // ── Right column: player list ─────────────────────────────────────
            LazyColumn(
                modifier = Modifier.weight(0.8f),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                val players = when (state) {
                    is GameUiState.ActiveQuestion -> state.players
                    is GameUiState.RoundResult    -> state.players
                    is GameUiState.Lobby          -> state.players
                    else                          -> emptyList()
                }

                items(players) { player ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors   = CardDefaults.cardColors(containerColor = GameCard),
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                text  = player.displayName,
                                style = MaterialTheme.typography.titleMedium,
                                color = if (player.isEliminated) Color.Gray else Color.White,
                            )
                            Text(
                                text  = "${player.score} pts | streak ${player.streak}" +
                                    if (player.isEliminated) " • ELIMINATED" else "",
                                style = MaterialTheme.typography.bodySmall,
                                color = if (player.isEliminated) Color.Gray else Color.LightGray,
                            )
                        }
                    }
                }
            }
        }

        // ── Loot-drop animated banner (slides from top) ───────────────────────
        AnimatedVisibility(
            visible = lootDropVisible,
            enter   = slideInVertically(initialOffsetY  = { -it }),
            exit    = slideOutVertically(targetOffsetY  = { -it }),
            modifier = Modifier
                .align(Alignment.TopCenter)
                .systemBarsPadding()
                .padding(top = 8.dp, start = 16.dp, end = 16.dp),
        ) {
            Card(
                colors = CardDefaults.cardColors(containerColor = GoldYellow),
                shape  = MaterialTheme.shapes.medium,
            ) {
                Text(
                    text     = lootDropText,
                    style    = MaterialTheme.typography.titleMedium,
                    color    = Color(0xFF1A1A2E),
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp),
                )
            }
        }

        // ── Snackbar host ─────────────────────────────────────────────────────
        SnackbarHost(
            hostState = snackbarHostState,
            modifier  = Modifier.align(Alignment.BottomCenter),
            snackbar  = { data ->
                Snackbar(
                    snackbarData     = data,
                    containerColor   = Color(0xFF6C3EF5),
                    contentColor     = Color.White,
                )
            },
        )

        // ── Reconnect overlay ─────────────────────────────────────────────────
        if (isReconnecting) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.72f)),
                contentAlignment = Alignment.Center,
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    CircularProgressIndicator(color = Color.White)
                    Text(
                        text  = "Reconnecting…",
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White,
                    )
                }
            }
        }
    }
}

// ── Countdown ring ────────────────────────────────────────────────────────────

@Composable
private fun CountdownRing(timerSeconds: Int, timeLimitMs: Int) {
    val trackColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.15f)
    val progressColor = MaterialTheme.colorScheme.primary
    val progress = if (timeLimitMs > 0) {
        ((timerSeconds * 1_000f) / timeLimitMs.toFloat()).coerceIn(0f, 1f)
    } else {
        0f
    }
    val sweepAngle by animateFloatAsState(
        targetValue = progress * 360f,
        label = "countdownRingSweep",
    )

    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(180.dp)
    ) {
        val radius = size.minDimension / 4f
        val center = Offset(size.width / 2f, size.height / 2f)
        drawCircle(
            color  = trackColor,
            radius = radius,
            center = center,
            style  = Stroke(width = 18f)
        )
        drawArc(
            color      = progressColor,
            startAngle = -90f,
            sweepAngle = sweepAngle,
            useCenter  = false,
            topLeft    = Offset(center.x - radius, center.y - radius),
            size       = androidx.compose.ui.geometry.Size(radius * 2, radius * 2),
            style      = Stroke(width = 18f, cap = StrokeCap.Round)
        )
    }
}

// ── Question card ─────────────────────────────────────────────────────────────

@Composable
private fun QuestionCard(
    state: GameUiState.ActiveQuestion,
    onAnswerSelected: (Int) -> Unit,
) {
    Card(colors = CardDefaults.cardColors(containerColor = GameCard)) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(text = state.phaseLabel, style = MaterialTheme.typography.labelLarge)
            Text(text = state.prompt, style = MaterialTheme.typography.headlineSmall)
            state.answers.forEachIndexed { index, answer ->
                val isSelected = state.selectedOptionIndex == index
                Button(
                    onClick = { onAnswerSelected(index) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = when {
                            isSelected -> AnswerLocked
                            else       -> MaterialTheme.colorScheme.primary
                        }
                    ),
                ) {
                    Text(text = "${index + 1}. $answer")
                }
            }
        }
    }
}

// ── Result card ───────────────────────────────────────────────────────────────

@Composable
private fun ResultCard(summary: String) {
    Card(colors = CardDefaults.cardColors(containerColor = GameCard)) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text(
                text  = "Round Result",
                style = MaterialTheme.typography.titleLarge,
                color = AnswerCorrect,
            )
            Text(
                text     = summary,
                modifier = Modifier.padding(top = 8.dp),
                color    = Color.White,
            )
        }
    }
}
