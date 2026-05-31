package com.quizroyale.showdown.ui.screens.home

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.quizroyale.showdown.data.auth.AuthRepository
import com.quizroyale.showdown.data.game.GameRepository
import com.quizroyale.showdown.data.push.FcmTokenRequest
import com.quizroyale.showdown.data.push.PushApi
import com.quizroyale.showdown.service.QuizFcmService
import com.quizroyale.showdown.ui.common.toUiMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HomeUiState(
    val username: String? = null,
    val isLoading: Boolean = false,
    val error: String? = null,
    val navigateToRoomId: String? = null,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val authRepository: AuthRepository,
    private val gameRepository: GameRepository,
    private val pushApi: PushApi,
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState(username = authRepository.currentUsername()))
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        uploadPendingFcmToken()
    }

    private fun uploadPendingFcmToken() {
        val encryptedPrefs = EncryptedSharedPreferences.create(
            context,
            QuizFcmService.PREF_FILE,
            MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
        val token = encryptedPrefs.getString(QuizFcmService.PREF_TOKEN, null) ?: return
        viewModelScope.launch {
            runCatching { pushApi.registerFcmToken(FcmTokenRequest(token)) }
                .onSuccess {
                    encryptedPrefs.edit().remove(QuizFcmService.PREF_TOKEN).apply()
                }
                .onFailure { android.util.Log.w("HomeViewModel", "FCM upload failed", it) }
        }
    }

    fun quickPlay() = createRoomInternal(isPrivate = false)
    fun createRoom() = createRoomInternal(isPrivate = true)

    fun joinByCode(code: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            runCatching { gameRepository.getRoom(code) }
                .onSuccess { room -> _uiState.update { it.copy(navigateToRoomId = room.code, isLoading = false) } }
                .onFailure { e -> _uiState.update { it.copy(error = e.toUiMessage(), isLoading = false) } }
        }
    }

    fun onNavigated() = _uiState.update { it.copy(navigateToRoomId = null) }

    private fun createRoomInternal(isPrivate: Boolean) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            runCatching { gameRepository.createRoom(isPrivate = isPrivate, maxPlayers = 8) }
                .onSuccess { room -> _uiState.update { it.copy(navigateToRoomId = room.code, isLoading = false) } }
                .onFailure { e -> _uiState.update { it.copy(error = e.toUiMessage(), isLoading = false) } }
        }
    }
}
