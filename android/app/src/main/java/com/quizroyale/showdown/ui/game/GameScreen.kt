package com.quizroyale.showdown.ui.game

import android.widget.Toast
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.dp
import com.quizroyale.showdown.domain.model.PowerupType
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

@Composable
fun GameScreen(
  state: GameUiState,
  onAnswerSelected: (Int) -> Unit,
  onPowerupSelected: (PowerupType, String?) -> Unit,
  sideEffects: Flow<GameSideEffect> = emptyFlow(),
  onNavigateToResults: (String) -> Unit = {}
) {
  val context = LocalContext.current
  val hapticFeedback = LocalHapticFeedback.current
  val currentOnNavigateToResults by rememberUpdatedState(onNavigateToResults)

  LaunchedEffect(sideEffects) {
    sideEffects.collect { effect ->
      when (effect) {
        GameSideEffect.HapticFeedback -> {
          hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
        }

        is GameSideEffect.ShowToast -> {
          Toast.makeText(context, effect.message, Toast.LENGTH_SHORT).show()
        }

        is GameSideEffect.ShowLevelUp -> {
          Toast.makeText(context, "Level ${effect.newLevel} reached.", Toast.LENGTH_SHORT).show()
        }

        is GameSideEffect.NavigateToResults -> currentOnNavigateToResults(effect.roomId)
      }
    }
  }

  Row(
    modifier = Modifier
      .fillMaxSize()
      .background(MaterialTheme.colorScheme.background)
      .padding(20.dp),
    horizontalArrangement = Arrangement.spacedBy(20.dp)
  ) {
    Column(
      modifier = Modifier.weight(1f),
      verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
      CountdownRing()

      when (state) {
        is GameUiState.Countdown -> {
          ResultCard("Next question starts in ${state.seconds}s.")
        }

        is GameUiState.ActiveQuestion -> {
          QuestionCard(
            state = state,
            onAnswerSelected = onAnswerSelected,
            onPowerupSelected = onPowerupSelected
          )
        }

        is GameUiState.RoundResult -> {
          ResultCard(state.summary)
        }

        is GameUiState.Elimination -> {
          ResultCard("Eliminated: ${state.eliminatedPlayerIds.joinToString().ifBlank { "none" }}")
        }

        is GameUiState.Finale -> {
          ResultCard("Final showdown: ${state.finalistIds.size} players remain.")
        }

        is GameUiState.GameOver -> {
          ResultCard("Winner: ${state.winnerId.ifBlank { "TBD" }} | XP awarded: ${state.xpAwarded}")
        }

        else -> {
          ResultCard("Waiting for the next round.")
        }
      }
    }

    LazyColumn(
      modifier = Modifier.weight(0.8f),
      verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      val players = when (state) {
        is GameUiState.ActiveQuestion -> state.players
        is GameUiState.RoundResult -> state.players
        is GameUiState.Lobby -> state.players
        is GameUiState.Countdown -> state.players
        is GameUiState.Elimination -> state.players
        is GameUiState.Finale -> state.players
        is GameUiState.GameOver -> state.players
        else -> emptyList()
      }

      items(players) { player ->
        Card(modifier = Modifier.fillMaxWidth()) {
          Column(modifier = Modifier.padding(16.dp)) {
            Text(text = player.displayName, style = MaterialTheme.typography.titleMedium)
            Text(text = "${player.score} pts | streak ${player.streak}")
          }
        }
      }
    }
  }
}

@Composable
private fun CountdownRing() {
  val trackColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.15f)
  val progressColor = MaterialTheme.colorScheme.primary

  Canvas(
    modifier = Modifier
      .fillMaxWidth()
      .height(180.dp)
  ) {
    val radius = size.minDimension / 4f
    val center = Offset(size.width / 2f, size.height / 2f)
    drawCircle(
      color = trackColor,
      radius = radius,
      center = center,
      style = Stroke(width = 18f)
    )
    drawArc(
      color = progressColor,
      startAngle = -90f,
      sweepAngle = 216f,
      useCenter = false,
      topLeft = Offset(center.x - radius, center.y - radius),
      size = androidx.compose.ui.geometry.Size(radius * 2, radius * 2),
      style = Stroke(width = 18f, cap = StrokeCap.Round)
    )
  }
}

@Composable
private fun QuestionCard(
  state: GameUiState.ActiveQuestion,
  onAnswerSelected: (Int) -> Unit,
  onPowerupSelected: (PowerupType, String?) -> Unit
) {
  Card {
    Column(
      modifier = Modifier.padding(20.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      Text(text = state.phaseLabel, style = MaterialTheme.typography.labelLarge)
      Text(text = "${state.timerSeconds}s remaining", style = MaterialTheme.typography.labelMedium)
      PowerupTray(
        enabled = !state.isAnswerLocked && state.activePowerupEffect?.isPending != true,
        activeEffect = state.activePowerupEffect,
        onPowerupSelected = onPowerupSelected
      )
      state.activePowerupEffect?.let { effect ->
        PowerupEffectBanner(effect)
      }
      Text(text = state.prompt, style = MaterialTheme.typography.headlineSmall)
      state.answers.forEachIndexed { index, answer ->
        Button(
          onClick = { onAnswerSelected(index) },
          enabled = !state.isAnswerLocked,
          modifier = Modifier.fillMaxWidth()
        ) {
          val selected = if (state.selectedAnswerIndex == index) " ✓" else ""
          Text(text = "${index + 1}. $answer$selected")
        }
      }
    }
  }
}

@Composable
private fun PowerupTray(
  enabled: Boolean,
  activeEffect: PowerupEffectUiModel?,
  onPowerupSelected: (PowerupType, String?) -> Unit
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .horizontalScroll(rememberScrollState()),
    horizontalArrangement = Arrangement.spacedBy(8.dp)
  ) {
    PowerupType.values().forEach { type ->
      OutlinedButton(
        onClick = { onPowerupSelected(type, null) },
        enabled = enabled,
        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
        modifier = Modifier.height(36.dp)
      ) {
        Text(
          text = type.trayLabel(activeEffect),
          style = MaterialTheme.typography.labelSmall
        )
      }
    }
  }
}

@Composable
private fun PowerupEffectBanner(effect: PowerupEffectUiModel) {
  Card(
    modifier = Modifier.fillMaxWidth(),
    colors = CardDefaults.cardColors(
      containerColor = if (effect.isPending) {
        MaterialTheme.colorScheme.tertiaryContainer
      } else {
        MaterialTheme.colorScheme.secondaryContainer
      }
    )
  ) {
    Column(
      modifier = Modifier.padding(12.dp),
      verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
      Text(text = effect.title, style = MaterialTheme.typography.titleSmall)
      Text(text = effect.detail, style = MaterialTheme.typography.bodySmall)
    }
  }
}

private fun PowerupType.trayLabel(activeEffect: PowerupEffectUiModel?): String {
  val baseLabel = when (this) {
    PowerupType.DOUBLE_DOWN -> "2x"
    PowerupType.FIFTY_FIFTY -> "50/50"
    PowerupType.TIME_FREEZE -> "Freeze"
    PowerupType.SHIELD -> "Shield"
    PowerupType.SABOTAGE -> "Sabotage"
  }
  return if (activeEffect?.type == this) {
    "$baseLabel on"
  } else {
    baseLabel
  }
}

@Composable
private fun ResultCard(summary: String) {
  Card {
    Column(modifier = Modifier.padding(20.dp)) {
      Text(text = "Round Result", style = MaterialTheme.typography.titleLarge)
      Text(text = summary, modifier = Modifier.padding(top = 8.dp))
    }
  }
}
