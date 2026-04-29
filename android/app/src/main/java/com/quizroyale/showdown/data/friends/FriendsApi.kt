package com.quizroyale.showdown.data.friends

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

@Serializable
data class FriendDto(
    val friendshipId: String,
    val id: String,
    val displayName: String,
    val avatarUrl: String? = null
)

@Serializable
data class FriendsResponse(
    val friends: List<FriendDto>
)

@Serializable
data class SearchUserDto(
    val id: String,
    val displayName: String,
    val avatarUrl: String? = null
)

@Serializable
data class SendFriendRequestBody(
    val addresseeId: String
)

interface FriendsApi {
    @GET("friends")
    suspend fun getFriends(): FriendsResponse

    @POST("friends/request")
    suspend fun sendFriendRequest(@Body body: SendFriendRequestBody)

    @DELETE("friends/{friendshipId}")
    suspend fun removeFriend(@Path("friendshipId") friendshipId: String)

    @GET("users/search")
    suspend fun searchUsers(@Query("q") query: String): List<SearchUserDto>
}
