package com.quizroyale.showdown.ui.screens.leaderboard

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import retrofit2.http.GET
import retrofit2.http.Header

@Serializable
data class LeaderboardRow(
    @SerialName("userId") val userId: String,
    @SerialName("displayName") val displayName: String,
    @SerialName("mmr") val mmr: Int,
    @SerialName("totalXp") val totalXp: Int,
    @SerialName("level") val level: Int
)

interface LeaderboardApi {
    @GET("leaderboard?season=current&limit=100")
    suspend fun getSeason(@Header("Authorization") auth: String): List<LeaderboardRow>

    @GET("leaderboard?limit=100")
    suspend fun getGlobal(@Header("Authorization") auth: String): List<LeaderboardRow>

    @GET("leaderboard/friends?limit=50")
    suspend fun getFriends(@Header("Authorization") auth: String): List<LeaderboardRow>
}
