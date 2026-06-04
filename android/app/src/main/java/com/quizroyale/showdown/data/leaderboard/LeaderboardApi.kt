package com.quizroyale.showdown.data.leaderboard

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import retrofit2.http.GET

@Serializable
data class LeaderboardRow(
    @SerialName("userId") val userId: String,
    @SerialName("displayName") val displayName: String,
    @SerialName("mmr") val mmr: Int,
    @SerialName("totalXp") val totalXp: Int,
    @SerialName("level") val level: Int
)

// Auth header is added by the OkHttp interceptor — do not add it manually here.
interface LeaderboardApi {
    @GET("leaderboard?season=current&limit=100")
    suspend fun getSeason(): List<LeaderboardRow>

    @GET("leaderboard?limit=100")
    suspend fun getGlobal(): List<LeaderboardRow>

    @GET("leaderboard/friends?limit=50")
    suspend fun getFriends(): List<LeaderboardRow>
}
