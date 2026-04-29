package com.quizroyale.showdown.ui.screens.friends

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel

private val Brand = Color(0xFF6C3EF5)
private val BgDark = Color(0xFF0E0E1A)
private val SurfaceCard = Color(0xFF1A1A2E)

@Composable
fun FriendsScreen(
    onNavigateBack: () -> Unit = {},
    viewModel: FriendsViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BgDark)
            .padding(16.dp)
    ) {
        // Top bar
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextButton(onClick = onNavigateBack) {
                Text("← Back", color = Color.White.copy(alpha = 0.6f))
            }
            Text(
                text = "Friends",
                color = Color.White,
                fontSize = 20.sp,
                fontWeight = FontWeight.Black,
                modifier = Modifier.padding(start = 8.dp)
            )
        }

        Spacer(Modifier.height(16.dp))

        // Error banner
        if (state.error != null) {
            Text(
                text = state.error!!,
                color = Color.Red,
                fontSize = 13.sp,
                modifier = Modifier.padding(bottom = 8.dp)
            )
        }

        // Search section
        Text(
            text = "Find Players",
            color = Color.White.copy(alpha = 0.7f),
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(bottom = 8.dp)
        )

        OutlinedTextField(
            value = state.searchQuery,
            onValueChange = { viewModel.searchUsers(it) },
            placeholder = { Text("Search by name…", color = Color.White.copy(alpha = 0.4f)) },
            singleLine = true,
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color.White,
                unfocusedTextColor = Color.White,
                focusedBorderColor = Brand,
                unfocusedBorderColor = Color.White.copy(alpha = 0.3f),
                cursorColor = Brand
            ),
            modifier = Modifier.fillMaxWidth()
        )

        if (state.searchResults.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 240.dp)
            ) {
                items(state.searchResults, key = { it.id }) { user ->
                    SearchUserRow(
                        user = user,
                        onAdd = { viewModel.sendRequest(user.id) }
                    )
                }
            }
        }

        Spacer(Modifier.height(24.dp))

        // Friends list section
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "My Friends (${state.friends.size})",
                color = Color.White.copy(alpha = 0.7f),
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold
            )
            if (state.isLoading) {
                CircularProgressIndicator(
                    color = Brand,
                    modifier = Modifier.size(20.dp),
                    strokeWidth = 2.dp
                )
            }
        }

        Spacer(Modifier.height(8.dp))

        if (state.friends.isEmpty() && !state.isLoading) {
            Text(
                text = "No friends yet — search above to add some!",
                color = Color.White.copy(alpha = 0.4f),
                fontSize = 13.sp,
                modifier = Modifier.padding(top = 8.dp)
            )
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                items(state.friends, key = { it.friendshipId }) { friend ->
                    FriendRow(
                        friend = friend,
                        onRemove = { viewModel.removeFriend(friend.friendshipId) }
                    )
                }
            }
        }
    }
}

@Composable
private fun SearchUserRow(
    user: SearchUser,
    onAdd: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(SurfaceCard, RoundedCornerShape(12.dp))
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = user.displayName,
            color = Color.White,
            fontSize = 15.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(1f)
        )
        Button(
            onClick = onAdd,
            enabled = !user.requestSent,
            colors = ButtonDefaults.buttonColors(
                containerColor = Brand,
                disabledContainerColor = Brand.copy(alpha = 0.4f)
            ),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp)
        ) {
            Text(
                text = if (user.requestSent) "Sent" else "Add",
                fontSize = 13.sp,
                color = Color.White
            )
        }
    }
}

@Composable
private fun FriendRow(
    friend: FriendUser,
    onRemove: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(SurfaceCard, RoundedCornerShape(12.dp))
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = friend.displayName,
            color = Color.White,
            fontSize = 15.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(1f)
        )
        OutlinedButton(
            onClick = onRemove,
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.Red.copy(alpha = 0.8f)),
            border = androidx.compose.foundation.BorderStroke(1.dp, Color.Red.copy(alpha = 0.6f)),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp)
        ) {
            Text(text = "Remove", fontSize = 13.sp)
        }
    }
}
