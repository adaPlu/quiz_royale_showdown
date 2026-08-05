package com.quizroyale.showdown.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quizroyale.showdown.data.auth.AuthRepository
import com.quizroyale.showdown.data.room.RoomRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val guestRoomCode: String = "",
    val guestDisplayName: String = "",
    val emailError: String? = null,
    val passwordError: String? = null,
    val guestError: String? = null,
    val generalError: String? = null,
    val isLoading: Boolean = false,
    val isGuestLoading: Boolean = false,
    val isLoggedIn: Boolean = false,
    val guestRoomReference: String? = null,
)

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val roomRepository: RoomRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    fun onEmailChange(value: String) =
        _uiState.update { it.copy(email = value, emailError = null) }

    fun onPasswordChange(value: String) =
        _uiState.update { it.copy(password = value, passwordError = null) }

    fun onGuestRoomCodeChange(value: String) {
        val normalized = value.uppercase().filter { it.isLetterOrDigit() }.take(8)
        _uiState.update { it.copy(guestRoomCode = normalized, guestError = null) }
    }

    fun onGuestDisplayNameChange(value: String) =
        _uiState.update {
            it.copy(
                guestDisplayName = value.take(40),
                guestError = null,
            )
        }

    fun onGuestNavigationHandled() {
        _uiState.update { it.copy(guestRoomReference = null) }
    }

    fun onLoginSubmit() {
        val state = _uiState.value
        var hasError = false

        if (state.email.isBlank() ||
            !android.util.Patterns.EMAIL_ADDRESS.matcher(state.email).matches()
        ) {
            _uiState.update { it.copy(emailError = "Enter a valid email") }
            hasError = true
        }
        if (state.password.length < 8) {
            _uiState.update { it.copy(passwordError = "Password must be at least 8 characters") }
            hasError = true
        }
        if (hasError) return

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, generalError = null) }
            try {
                authRepository.login(state.email, state.password)
                _uiState.update { it.copy(isLoggedIn = true, isLoading = false) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        generalError = e.message ?: "Login failed",
                        isLoading = false,
                    )
                }
            }
        }
    }

    fun onGuestSubmit() {
        val state = _uiState.value
        val roomCode = state.guestRoomCode.trim().uppercase()
        if (roomCode.length != 6 && roomCode.length != 8) {
            _uiState.update { it.copy(guestError = "Enter a valid 6-character room code") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isGuestLoading = true, guestError = null, generalError = null) }
            try {
                authRepository.guest(roomCode, state.guestDisplayName)
                val room = roomRepository.joinRoom(roomCode)
                _uiState.update {
                    it.copy(
                        isGuestLoading = false,
                        guestRoomReference = room.roomReference,
                    )
                }
            } catch (e: Exception) {
                authRepository.clearSession()
                _uiState.update {
                    it.copy(
                        isGuestLoading = false,
                        guestError = e.message ?: "Unable to join as guest",
                    )
                }
            }
        }
    }
}
