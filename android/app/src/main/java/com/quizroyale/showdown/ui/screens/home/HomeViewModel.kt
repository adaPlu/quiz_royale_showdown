package com.quizroyale.showdown.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quizroyale.showdown.data.auth.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.POST
import javax.inject.Inject

interface RoomsApi {
    @POST("api/v1/rooms")
    suspend fun createRoom(@Body body: Map<String, @JvmSuppressWildcards Any>): RoomResponse

    @POST("api/v1/rooms/join")
    suspend fun joinRoom(@Body body: Map<String, @JvmSuppressWildcards String?>): RoomResponse
}

data class RoomResponse(val roomId: String, val roomCode: String)

data class HomeUiState(
    val username: String? = null,
    val isLoading: Boolean = false,
    val error: String? = null,
    val navigateToRoomId: String? = null,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val retrofit: Retrofit,
) : ViewModel() {

    private val roomsApi: RoomsApi by lazy { retrofit.create(RoomsApi::class.java) }

    private val _uiState = MutableStateFlow(HomeUiState(username = authRepository.currentUsername()))
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    fun quickPlay() = createRoomInternal(isPrivate = false)
    fun createRoom() = createRoomInternal(isPrivate = true)

    fun joinByCode(code: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            runCatching { roomsApi.joinRoom(mapOf("roomCode" to code)) }
                .onSuccess { r -> _uiState.update { it.copy(navigateToRoomId = r.roomId, isLoading = false) } }
                .onFailure { e -> _uiState.update { it.copy(error = e.message ?: "Failed to join", isLoading = false) } }
        }
    }

    fun onNavigated() = _uiState.update { it.copy(navigateToRoomId = null) }

    private fun createRoomInternal(isPrivate: Boolean) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            runCatching {
                roomsApi.createRoom(mapOf("isPrivate" to isPrivate, "maxPlayers" to 8))
            }
                .onSuccess { r -> _uiState.update { it.copy(navigateToRoomId = r.roomId, isLoading = false) } }
                .onFailure { e -> _uiState.update { it.copy(error = e.message ?: "Failed to create room", isLoading = false) } }
        }
    }
}
