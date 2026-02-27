package com.quizroyale.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun QuestionScreen(
    onCorrectAnswer: () -> Unit,
    onWrongAnswer: () -> Unit
) {
    Scaffold { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text("Round 1", style = MaterialTheme.typography.headlineMedium)
            Text("Time Left: 12s")
            Text("Alive: YES")
            Text(
                text = "Which planet is known as the Red Planet?",
                style = MaterialTheme.typography.titleLarge
            )

            AnswerButton("Earth", onWrongAnswer)
            AnswerButton("Mars", onCorrectAnswer)
            AnswerButton("Venus", onWrongAnswer)
            AnswerButton("Jupiter", onWrongAnswer)

            Text("Power-Ups", style = MaterialTheme.typography.titleMedium)

            OutlinedButton(onClick = { }, modifier = Modifier.fillMaxWidth()) {
                Text("Use 50/50")
            }

            OutlinedButton(onClick = { }, modifier = Modifier.fillMaxWidth()) {
                Text("Use Shield")
            }
        }
    }
}

@Composable
private fun AnswerButton(label: String, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(label)
    }
}