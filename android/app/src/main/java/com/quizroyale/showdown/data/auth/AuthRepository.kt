package com.quizroyale.showdown.data.auth

import android.content.Context
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import org.json.JSONObject

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

  suspend fun register(email: String, displayName: String, password: String): AuthResponse {
    val response = authApi.register(
      RegisterRequest(email = email, displayName = displayName, password = password)
    )
    persistSession(response)
    return response
  }

  suspend fun login(email: String, password: String): AuthResponse {
    val response = authApi.login(LoginRequest(email = email, password = password))
    persistSession(response)
    return response
  }

  suspend fun refreshIfPossible(): AuthTokens? {
    val refreshToken = prefs.getString(KEY_REFRESH_TOKEN, null) ?: return null
    val response = authApi.refresh(RefreshRequest(refreshToken))
    persistTokens(response.tokens)
    return response.tokens
  }

  fun currentAccessToken(): String? = prefs.getString(KEY_ACCESS_TOKEN, null)

  fun currentUserId(): String {
    return prefs.getString(KEY_USER_ID, null)
      ?: currentAccessToken()?.let { token -> tokenClaim(token, "sub") }
      ?: ""
  }

  fun currentUsername(): String? {
    return prefs.getString(KEY_USERNAME, null)
      ?: currentAccessToken()?.let { token -> tokenClaim(token, "displayName") }
  }

  private fun persistSession(response: AuthResponse) {
    persistTokens(response.tokens)
    response.user?.let { user ->
      prefs.edit()
        .putString(KEY_USER_ID, user.id)
        .putString(KEY_USERNAME, user.displayName)
        .apply()
    }
  }

  private fun persistTokens(tokens: AuthTokens) {
    val editor = prefs.edit()
      .putString(KEY_ACCESS_TOKEN, tokens.accessToken)
      .putString(KEY_REFRESH_TOKEN, tokens.refreshToken)

    tokenClaim(tokens.accessToken, "sub")?.let { editor.putString(KEY_USER_ID, it) }
    tokenClaim(tokens.accessToken, "displayName")?.let { editor.putString(KEY_USERNAME, it) }
    editor.apply()
  }

  private fun tokenClaim(token: String, key: String): String? {
    return runCatching {
      val payload = token.split(".").getOrNull(1) ?: return null
      val decoded = Base64.decode(payload, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
      JSONObject(String(decoded, Charsets.UTF_8)).optString(key).takeIf { it.isNotBlank() }
    }.getOrNull()
  }

  companion object {
    private const val KEY_ACCESS_TOKEN = "access_token"
    private const val KEY_REFRESH_TOKEN = "refresh_token"
    private const val KEY_USER_ID = "user_id"
    private const val KEY_USERNAME = "username"
  }
}
