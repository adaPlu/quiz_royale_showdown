package com.quizroyale.showdown.data.user

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import retrofit2.http.GET

@Serializable
data class UserMeResponse(
    val id: String,
    val email: String,
    val displayName: String,
    @SerialName("avatarUrl") val avatarUrl: String? = null,
    @SerialName("totalXp") val totalXp: Int = 0,
    val level: Int = 1,
    @SerialName("xpToNextLevel") val xpToNextLevel: Int = 150,
    val wins: Int = 0,
    @SerialName("gamesPlayed") val gamesPlayed: Int = 0,
    val mmr: Int = 1000,
)

interface UserApi {
    @GET("users/me")
    suspend fun getMe(): UserMeResponse
}
