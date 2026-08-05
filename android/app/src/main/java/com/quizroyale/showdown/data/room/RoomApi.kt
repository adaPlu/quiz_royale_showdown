package com.quizroyale.showdown.data.room

import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

interface RoomApi {
    @POST("rooms")
    suspend fun createRoom(@Body request: CreateRoomRequest): JsonObject

    @POST("rooms/join")
    suspend fun joinRoom(@Body request: JoinRoomRequest): JsonObject

    @GET("rooms/{roomReference}")
    suspend fun getRoom(@Path("roomReference") roomReference: String): JsonObject

    @GET("rooms/by-id/{roomId}")
    suspend fun getRoomById(@Path("roomId") roomId: String): JsonObject

    @PATCH("rooms/by-id/{roomId}/difficulty")
    suspend fun setDifficulty(
        @Path("roomId") roomId: String,
        @Body request: UpdateDifficultyRequest,
    ): JsonObject

    @POST("rooms/{roomId}/start")
    suspend fun startGame(
        @Path("roomId") roomId: String,
        @Body request: StartGameRequest,
    ): JsonObject
}
