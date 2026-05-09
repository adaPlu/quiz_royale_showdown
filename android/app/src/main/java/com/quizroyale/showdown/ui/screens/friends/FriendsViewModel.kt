package com.quizroyale.showdown.ui.screens.friends

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quizroyale.showdown.data.friends.FriendsApi
import com.quizroyale.showdown.data.friends.SendFriendRequestBody
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

data class FriendUser(
    val friendshipId: String,
    val id: String,
    val displayName: String,
    val avatarUrl: String?
)

data class SearchUser(
    val id: String,
    val displayName: String,
    val avatarUrl: String?,
    val requestSent: Boolean = false
)

data class PendingFriendUser(
    val friendshipId: String,
    val id: String,
    val displayName: String,
    val avatarUrl: String?
)

data class FriendsUiState(
    val friends: List<FriendUser> = emptyList(),
    val pendingRequests: List<PendingFriendUser> = emptyList(),
    val searchResults: List<SearchUser> = emptyList(),
    val searchQuery: String = "",
    val isLoading: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class FriendsViewModel @Inject constructor(
    private val friendsApi: FriendsApi
) : ViewModel() {

    private val _uiState = MutableStateFlow(FriendsUiState())
    val uiState: StateFlow<FriendsUiState> = _uiState

    init {
        loadFriends()
        loadPendingRequests()
    }

    fun loadFriends() {
        _uiState.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val response = withContext(Dispatchers.IO) { friendsApi.getFriends() }
                val friends = response.friends.map { dto ->
                    FriendUser(
                        friendshipId = dto.friendshipId,
                        id = dto.id,
                        displayName = dto.displayName,
                        avatarUrl = dto.avatarUrl
                    )
                }
                _uiState.update { it.copy(friends = friends, isLoading = false) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message ?: "Failed to load friends") }
            }
        }
    }

    fun searchUsers(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
        if (query.length < 2) {
            _uiState.update { it.copy(searchResults = emptyList()) }
            return
        }
        viewModelScope.launch {
            try {
                val results = withContext(Dispatchers.IO) { friendsApi.searchUsers(query) }
                val searchUsers = results.map { dto ->
                    SearchUser(
                        id = dto.id,
                        displayName = dto.displayName,
                        avatarUrl = dto.avatarUrl
                    )
                }
                _uiState.update { it.copy(searchResults = searchUsers) }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message ?: "Search failed") }
            }
        }
    }

    fun sendRequest(userId: String) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    friendsApi.sendFriendRequest(SendFriendRequestBody(addresseeId = userId))
                }
                _uiState.update { state ->
                    state.copy(
                        searchResults = state.searchResults.map { user ->
                            if (user.id == userId) user.copy(requestSent = true) else user
                        }
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message ?: "Failed to send request") }
            }
        }
    }

    fun loadPendingRequests() {
        viewModelScope.launch {
            try {
                val response = withContext(Dispatchers.IO) { friendsApi.getPendingRequests() }
                val pending = response.pending.map { dto ->
                    PendingFriendUser(
                        friendshipId = dto.friendshipId,
                        id = dto.requester.id,
                        displayName = dto.requester.displayName,
                        avatarUrl = dto.requester.avatarUrl
                    )
                }
                _uiState.update { it.copy(pendingRequests = pending) }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message ?: "Failed to load pending requests") }
            }
        }
    }

    fun acceptRequest(friendshipId: String) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { friendsApi.acceptFriendRequest(friendshipId) }
                _uiState.update { state ->
                    val accepted = state.pendingRequests.find { it.friendshipId == friendshipId }
                    val newFriend = accepted?.let {
                        FriendUser(friendshipId = it.friendshipId, id = it.id, displayName = it.displayName, avatarUrl = it.avatarUrl)
                    }
                    state.copy(
                        pendingRequests = state.pendingRequests.filter { it.friendshipId != friendshipId },
                        friends = if (newFriend != null) state.friends + newFriend else state.friends
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message ?: "Failed to accept request") }
            }
        }
    }

    fun removeFriend(friendshipId: String) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { friendsApi.removeFriend(friendshipId) }
                _uiState.update { state ->
                    state.copy(friends = state.friends.filter { it.friendshipId != friendshipId })
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message ?: "Failed to remove friend") }
            }
        }
    }
}
