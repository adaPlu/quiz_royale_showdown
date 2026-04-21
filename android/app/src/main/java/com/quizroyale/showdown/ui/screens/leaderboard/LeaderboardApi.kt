package com.quizroyale.showdown.ui.screens.leaderboard

import com.google.gson.annotations.SerializedName
import retrofit2.http.GET
import retrofit2.http.Header

data class LeaderboardRow(
    @SerializedName("userId") val userId: String,
    @SerializedName("displayName") val displayName: String,
    @SerializedName("mmr") val mmr: Int?,
    @SerializedName("totalXp") val totalXp: Int?,
    @SerializedName("level") val level: Int?
)

interface LeaderboardApi {
    @GET("leaderboard?season=current&limit=100")
    suspend fun getSeason(@Header("Authorization") auth: String): List<LeaderboardRow>

    @GET("leaderboard?limit=100")
    suspend fun getGlobal(@Header("Authorization") auth: String): List<LeaderboardRow>

    @GET("leaderboard/friends?limit=50")
    suspend fun getFriends(@Header("Authorization") auth: String): List<LeaderboardRow>
}
