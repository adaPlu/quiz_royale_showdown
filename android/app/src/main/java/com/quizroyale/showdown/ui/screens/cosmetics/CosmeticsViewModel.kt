package com.quizroyale.showdown.ui.screens.cosmetics

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quizroyale.showdown.data.cosmetics.ApiCosmetic
import com.quizroyale.showdown.data.cosmetics.CosmeticsApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.Retrofit
import javax.inject.Inject

data class CosmeticItem(
    val id: String,
    val name: String,
    val type: String,
    val emoji: String,
    val owned: Boolean,
    val equipped: Boolean
)

sealed interface CosmeticsUiState {
    data object Loading : CosmeticsUiState
    data class Error(val message: String) : CosmeticsUiState
    data class Success(val cosmetics: List<CosmeticItem>, val equipError: String? = null) : CosmeticsUiState
}

private fun ApiCosmetic.toUiItem() = CosmeticItem(
    id = id,
    name = name,
    type = type,
    emoji = when (type.uppercase()) {
        "AVATAR_FRAME" -> "🖼️"
        "CARD_BACK"    -> "🃏"
        "TITLE"        -> "🏅"
        "EMOTE"        -> "🎭"
        else           -> "✨"
    },
    owned = isOwned,
    equipped = isEquipped
)

@HiltViewModel
class CosmeticsViewModel @Inject constructor(
    retrofit: Retrofit
) : ViewModel() {

    private val api = retrofit.create(CosmeticsApi::class.java)
    private val _uiState = MutableStateFlow<CosmeticsUiState>(CosmeticsUiState.Loading)
    val uiState: StateFlow<CosmeticsUiState> = _uiState

    init { load() }

    private fun load() {
        viewModelScope.launch {
            try {
                val items = api.getAll().map { it.toUiItem() }
                _uiState.value = CosmeticsUiState.Success(items)
            } catch (e: Exception) {
                _uiState.value = CosmeticsUiState.Error(e.message ?: "Failed to load cosmetics")
            }
        }
    }

    fun equip(cosmeticId: String) {
        viewModelScope.launch {
            try {
                api.equip(cosmeticId)
                // Optimistic update — mark equipped, unequip others of same type
                _uiState.update { state ->
                    if (state !is CosmeticsUiState.Success) return@update state
                    val target = state.cosmetics.find { it.id == cosmeticId } ?: return@update state
                    CosmeticsUiState.Success(state.cosmetics.map { item ->
                        when {
                            item.id == cosmeticId -> item.copy(equipped = true)
                            item.type == target.type -> item.copy(equipped = false)
                            else -> item
                        }
                    })
                }
            } catch (e: Exception) {
                _uiState.update { state ->
                    if (state !is CosmeticsUiState.Success) return@update state
                    state.copy(equipError = e.message ?: "Failed to equip cosmetic")
                }
            }
        }
    }

    fun clearEquipError() {
        _uiState.update { state ->
            if (state !is CosmeticsUiState.Success) return@update state
            state.copy(equipError = null)
        }
    }
}
