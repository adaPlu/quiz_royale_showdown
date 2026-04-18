package com.quizroyale.showdown.data.remote.model

import kotlinx.serialization.Serializable

@Serializable
data class RegisterRequest(
    val username: String,
    val email: String,
    val password: String,
)

@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
)

@Serializable
data class TokenResponse(
    val accessToken: String,
    val refreshToken: String,
    val userId: String,
)

@Serializable
data class UserProfile(
    val id: String,
    val username: String,
    val email: String,
    val displayName: String?,
    val xp: Int,
    val level: Int,
    val coins: Int,
    val avatarUrl: String?,
)
