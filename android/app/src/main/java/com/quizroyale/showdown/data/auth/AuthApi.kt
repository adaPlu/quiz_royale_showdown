package com.quizroyale.showdown.data.auth

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.POST

@Serializable
data class AuthTokens(
  val accessToken: String,
  val refreshToken: String
)

@Serializable
data class AuthUser(
  val id: String,
  val email: String,
  val displayName: String
)

@Serializable
data class RegisterRequest(
  val email: String,
  val displayName: String,
  val password: String
)

@Serializable
data class LoginRequest(
  val email: String,
  val password: String
)

@Serializable
data class RefreshRequest(
  val refreshToken: String
)

@Serializable
data class AuthResponse(
  val user: AuthUser? = null,
  val tokens: AuthTokens
)

interface AuthApi {
  @POST("auth/register")
  suspend fun register(@Body request: RegisterRequest): AuthResponse

  @POST("auth/login")
  suspend fun login(@Body request: LoginRequest): AuthResponse

  @POST("auth/refresh")
  suspend fun refresh(@Body request: RefreshRequest): AuthResponse
}
