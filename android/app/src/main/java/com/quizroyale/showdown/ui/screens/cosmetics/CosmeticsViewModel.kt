package com.quizroyale.showdown.ui.screens.cosmetics

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quizroyale.showdown.data.auth.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class CosmeticItem(
    val id: String,
    val name: String,
    val type: String,
    val emoji: String,
    val owned: Boolean,
    val equipped: Boolean,
)

sealed interface CosmeticsUiState {
    data object Loading : CosmeticsUiState
    data class Error(val message: String) : CosmeticsUiState
    data class Success(val cosmetics: List<CosmeticItem>) : CosmeticsUiState
}

@HiltViewModel
class CosmeticsViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<CosmeticsUiState>(CosmeticsUiState.Loading)
    val uiState: StateFlow<CosmeticsUiState> = _uiState

    init {
        load()
    }

    private fun load() {
        viewModelScope.launch {
            authRepository.currentAccessToken()
            // Cosmetics are out of beta launch scope until the backend route is mounted.
            _uiState.value = CosmeticsUiState.Success(emptyList())
        }
    }

    fun equip(cosmeticId: String) {
        viewModelScope.launch {
            _uiState.update { state ->
                if (state !is CosmeticsUiState.Success) return@update state
                val target = state.cosmetics.find { it.id == cosmeticId } ?: return@update state
                CosmeticsUiState.Success(
                    state.cosmetics.map { item ->
                        when {
                            item.id == cosmeticId -> item.copy(equipped = true)
                            item.type == target.type -> item.copy(equipped = false)
                            else -> item
                        }
                    },
                )
            }
        }
    }
}
