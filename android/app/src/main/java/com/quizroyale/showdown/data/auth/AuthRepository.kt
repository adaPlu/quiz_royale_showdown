package com.quizroyale.showdown.data.auth

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

@Singleton
class AuthRepository @Inject constructor(
  @ApplicationContext context: Context,
  private val authApi: AuthApi
) {
  private val refreshMutex = Mutex()

  private val prefs = EncryptedSharedPreferences.create(
    context,
    "quiz_royale_secure",
    MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
  )

  suspend fun login(email: String, password: String): AuthResponse {
    val response = authApi.login(
      LoginRequest(
        email = email.trim().lowercase(),
        password = password
      )
    )
    persistSession(response)
    return response
  }

  suspend fun register(username: String, email: String, password: String): AuthResponse {
    val normalizedUsername = username.trim()
    val response = authApi.register(
      RegisterRequest(
        email = email.trim().lowercase(),
        username = normalizedUsername,
        displayName = normalizedUsername,
        password = password
      )
    )
    persistSession(response)
    return response
  }

  suspend fun guest(roomCode: String, displayName: String?): GuestAuthResponse {
    clearSession()
    val response = authApi.guest(
      GuestRequest(
        roomCode = roomCode.trim().uppercase(),
        displayName = displayName?.trim()?.takeIf { it.isNotEmpty() },
      )
    )
    prefs.edit()
      .putString(KEY_ACCESS_TOKEN, response.accessToken)
      .putString(KEY_USER_ID, response.user.id)
      .putBoolean(KEY_IS_GUEST, true)
      .remove(KEY_REFRESH_TOKEN)
      .apply()
    return response
  }

  suspend fun refreshIfPossible(): AuthTokens? {
    return refreshMutex.withLock {
      if (isGuest()) return@withLock null
      val refreshToken = prefs.getString(KEY_REFRESH_TOKEN, null) ?: return@withLock null
      val response = runCatching {
        authApi.refresh(RefreshRequest(refreshToken))
      }.getOrElse {
        clearSession()
        return@withLock null
      }

      val tokens = response.toTokens()
      persistTokens(tokens)
      tokens
    }
  }

  fun currentAccessToken(): String? = prefs.getString(KEY_ACCESS_TOKEN, null)

  fun currentUserId(): String? = prefs.getString(KEY_USER_ID, null)

  fun isGuest(): Boolean = prefs.getBoolean(KEY_IS_GUEST, false)

  fun clearSession() {
    prefs.edit().clear().apply()
  }

  private fun persistSession(response: AuthResponse) {
    persistTokens(response.toTokens())
    prefs.edit()
      .putBoolean(KEY_IS_GUEST, false)
      .apply()
    response.user?.id?.let { prefs.edit().putString(KEY_USER_ID, it).apply() }
  }

  private fun persistTokens(tokens: AuthTokens) {
    prefs.edit()
      .putString(KEY_ACCESS_TOKEN, tokens.accessToken)
      .putString(KEY_REFRESH_TOKEN, tokens.refreshToken)
      .apply()
  }

  private fun AuthResponse.toTokens(): AuthTokens = AuthTokens(
    accessToken = accessToken,
    refreshToken = refreshToken
  )

  companion object {
    private const val KEY_ACCESS_TOKEN = "access_token"
    private const val KEY_REFRESH_TOKEN = "refresh_token"
    private const val KEY_USER_ID = "user_id"
    private const val KEY_IS_GUEST = "is_guest"
  }
}
