package com.quizroyale.showdown.data.auth

import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TokenRefreshAuthenticator @Inject constructor(
  private val authRepository: AuthRepository
) : Authenticator {
  override fun authenticate(route: Route?, response: Response): Request? {
    // Avoid infinite loops if refresh itself returns 401
    if (response.request.header("X-Auth-Retry") != null) return null

    val newToken = runBlocking { authRepository.refreshIfPossible() } ?: return null

    return response.request.newBuilder()
      .header("Authorization", "Bearer ${newToken.accessToken}")
      .header("X-Auth-Retry", "true")
      .build()
  }
}
