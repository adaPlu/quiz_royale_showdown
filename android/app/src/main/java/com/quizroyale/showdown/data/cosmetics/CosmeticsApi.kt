package com.quizroyale.showdown.data.cosmetics

import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

data class ApiCosmetic(
    val id: String = "",
    val name: String = "",
    val type: String = "",
    val imageUrl: String? = null,
    val isOwned: Boolean = false,
    val isEquipped: Boolean = false
)

interface CosmeticsApi {
    @GET("cosmetics")
    suspend fun getAll(): List<ApiCosmetic>

    @POST("cosmetics/{id}/equip")
    suspend fun equip(@Path("id") id: String): Map<String, Any>
}
