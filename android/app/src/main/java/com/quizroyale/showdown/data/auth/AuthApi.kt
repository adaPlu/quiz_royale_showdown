package com.quizroyale.showdown.data.auth

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.Headers
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
  val displayName: String,
  val isGuest: Boolean = false,
)

@Serializable
data class RegisterRequest(
  val email: String,
  val username: String,
  val displayName: String,
  val password: String
)

@Serializable
data class LoginRequest(
  val email: String,
  val password: String
)

@Serializable
data class GuestRequest(
  val roomCode: String,
  val displayName: String? = null,
)

@Serializable
data class RefreshRequest(
  val refreshToken: String
)

@Serializable
data class AuthResponse(
  val user: AuthUser? = null,
  val accessToken: String,
  val refreshToken: String
)

@Serializable
data class GuestAuthResponse(
  val user: AuthUser,
  val accessToken: String,
  val roomCode: String,
)

interface AuthApi {
  @Headers("x-refresh-token-response: body")
  @POST("auth/register")
  suspend fun register(@Body request: RegisterRequest): AuthResponse

  @Headers("x-refresh-token-response: body")
  @POST("auth/login")
  suspend fun login(@Body request: LoginRequest): AuthResponse

  @POST("auth/guest")
  suspend fun guest(@Body request: GuestRequest): GuestAuthResponse

  @Headers("x-refresh-token-response: body")
  @POST("auth/refresh")
  suspend fun refresh(@Body request: RefreshRequest): AuthResponse
}
