package com.quizroyale.showdown.data.game

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface GameApi {
  @POST("rooms")
  suspend fun createRoom(@Body request: CreateRoomRequest): RoomResponse

  @GET("rooms/{roomCode}")
  suspend fun getRoom(@Path("roomCode") roomCode: String): RoomResponse

  @POST("rooms/{roomId}/start")
  suspend fun startRoom(@Path("roomId") roomId: String)

  @POST("rooms/{roomId}/leave")
  suspend fun leaveRoom(@Path("roomId") roomId: String)

  @GET("powerups")
  suspend fun getPowerups(): List<PowerupResponse>

  @GET("powerups/inventory")
  suspend fun getPowerupInventory(): List<PowerupResponse>
}
