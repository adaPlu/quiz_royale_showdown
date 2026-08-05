package com.quizroyale.showdown.ui.screens.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    onGuestJoined: (String) -> Unit,
    onNavigateToRegister: () -> Unit,
    viewModel: LoginViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val focusManager = LocalFocusManager.current

    LaunchedEffect(uiState.isLoggedIn) {
        if (uiState.isLoggedIn) onLoginSuccess()
    }

    LaunchedEffect(uiState.guestRoomReference) {
        val roomReference = uiState.guestRoomReference ?: return@LaunchedEffect
        onGuestJoined(roomReference)
        viewModel.onGuestNavigationHandled()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Quiz Royale", style = MaterialTheme.typography.displaySmall)
        Text(
            "Showdown",
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.primary,
        )

        Spacer(Modifier.height(32.dp))

        OutlinedTextField(
            value = uiState.email,
            onValueChange = viewModel::onEmailChange,
            label = { Text("Email") },
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Next,
            ),
            keyboardActions = KeyboardActions(
                onNext = { focusManager.moveFocus(FocusDirection.Down) },
            ),
            isError = uiState.emailError != null,
            supportingText = uiState.emailError?.let { { Text(it) } },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )

        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = uiState.password,
            onValueChange = viewModel::onPasswordChange,
            label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Done,
            ),
            keyboardActions = KeyboardActions(
                onDone = { viewModel.onLoginSubmit() },
            ),
            isError = uiState.passwordError != null,
            supportingText = uiState.passwordError?.let { { Text(it) } },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )

        if (uiState.generalError != null) {
            Spacer(Modifier.height(8.dp))
            Text(
                text = uiState.generalError!!,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
        }

        Spacer(Modifier.height(20.dp))

        Button(
            onClick = viewModel::onLoginSubmit,
            enabled = !uiState.isLoading && !uiState.isGuestLoading,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
        ) {
            if (uiState.isLoading) {
                CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
            } else {
                Text("Sign In")
            }
        }

        Spacer(Modifier.height(12.dp))

        TextButton(onClick = onNavigateToRegister) {
            Text("Don't have an account? Register")
        }

        Spacer(Modifier.height(20.dp))
        HorizontalDivider()
        Spacer(Modifier.height(20.dp))

        Text("Play as Guest", style = MaterialTheme.typography.titleLarge)
        Text(
            "Enter a room code and a display name. No signup is required.",
            style = MaterialTheme.typography.bodyMedium,
        )

        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = uiState.guestRoomCode,
            onValueChange = viewModel::onGuestRoomCodeChange,
            label = { Text("Room Code") },
            supportingText = { Text("Use the 6-character code from the host.") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )

        Spacer(Modifier.height(8.dp))

        OutlinedTextField(
            value = uiState.guestDisplayName,
            onValueChange = viewModel::onGuestDisplayNameChange,
            label = { Text("Display Name (optional)") },
            supportingText = { Text("A userID### name is assigned when left blank.") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )

        uiState.guestError?.let { error ->
            Spacer(Modifier.height(8.dp))
            Text(
                text = error,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
        }

        Spacer(Modifier.height(12.dp))

        OutlinedButton(
            onClick = viewModel::onGuestSubmit,
            enabled = !uiState.isLoading && !uiState.isGuestLoading,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
        ) {
            if (uiState.isGuestLoading) {
                CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
            } else {
                Text("Join Room as Guest")
            }
        }
    }
}
