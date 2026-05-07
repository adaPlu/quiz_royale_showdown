package com.quizroyale.showdown.data.push

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.POST

@Serializable
data class FcmTokenRequest(val token: String)

interface PushApi {
    @POST("push/fcm-token")
    suspend fun registerFcmToken(@Body request: FcmTokenRequest)
}
