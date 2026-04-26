package com.quizroyale.showdown.ui.screens.leaderboard

import retrofit2.http.GET
import retrofit2.http.Header

data class LeaderboardRow(
    val userId: String,
    val displayName: String,
    val mmr: Int?,
    val totalXp: Int?,
    val level: Int?
)

interface LeaderboardApi {
    @GET("leaderboard?season=current&limit=100")
    suspend fun getSeason(@Header("Authorization") auth: String): List<LeaderboardRow>

    @GET("leaderboard?limit=100")
    suspend fun getGlobal(@Header("Authorization") auth: String): List<LeaderboardRow>

    @GET("leaderboard/friends?limit=50")
    suspend fun getFriends(@Header("Authorization") auth: String): List<LeaderboardRow>
}
