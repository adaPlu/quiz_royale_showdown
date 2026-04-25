package com.quizroyale.showdown.data.auth

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
  @ApplicationContext context: Context,
  private val authApi: AuthApi
) {
  private val prefs = EncryptedSharedPreferences.create(
    context,
    "quiz_royale_secure",
    MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
  )

  suspend fun login(email: String, password: String): AuthResponse {
    val response = authApi.login(LoginRequest(email = email, password = password))
    persistTokens(response.tokens)
    response.user?.id?.let { prefs.edit().putString(KEY_USER_ID, it).apply() }
    return response
  }

  suspend fun refreshIfPossible(): AuthTokens? {
    val refreshToken = prefs.getString(KEY_REFRESH_TOKEN, null) ?: return null
    val response = authApi.refresh(RefreshRequest(refreshToken))
    persistTokens(response.tokens)
    return response.tokens
  }

  fun currentAccessToken(): String? = prefs.getString(KEY_ACCESS_TOKEN, null)

  fun currentUserId(): String? = prefs.getString(KEY_USER_ID, null)

  private fun persistTokens(tokens: AuthTokens) {
    prefs.edit()
      .putString(KEY_ACCESS_TOKEN, tokens.accessToken)
      .putString(KEY_REFRESH_TOKEN, tokens.refreshToken)
      .apply()
  }

  companion object {
    private const val KEY_ACCESS_TOKEN = "access_token"
    private const val KEY_REFRESH_TOKEN = "refresh_token"
    private const val KEY_USER_ID = "user_id"
  }
}
