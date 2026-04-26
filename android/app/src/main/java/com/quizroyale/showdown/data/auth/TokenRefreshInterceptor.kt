package com.quizroyale.showdown.data.auth

import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Provider
import javax.inject.Singleton

@Singleton
class TokenRefreshInterceptor @Inject constructor(
  private val authRepositoryProvider: Provider<AuthRepository>
) : Interceptor {
  override fun intercept(chain: Interceptor.Chain): Response {
    val authRepository = authRepositoryProvider.get()
    val originalRequest = chain.request()
    if (originalRequest.isAuthRequest()) {
      return chain.proceed(originalRequest)
    }

    val accessToken = authRepository.currentAccessToken()
    val request = originalRequest.newBuilder().apply {
      accessToken?.let { header("Authorization", "Bearer $it") }
    }.build()

    val response = chain.proceed(request)
    if (response.code != 401 || request.header(HEADER_RETRY_ATTEMPTED) != null) {
      return response
    }

    val latestToken = authRepository.currentAccessToken()
    val replacementToken = when {
      latestToken != null && latestToken != accessToken -> latestToken
      else -> runBlocking { authRepository.refreshIfPossible()?.accessToken }
    } ?: return response

    response.close()
    val retryRequest = originalRequest.newBuilder()
      .header("Authorization", "Bearer $replacementToken")
      .header(HEADER_RETRY_ATTEMPTED, "true")
      .build()
    return chain.proceed(retryRequest)
  }

  private fun Request.isAuthRequest(): Boolean {
    if (!url.pathSegments.contains("auth")) {
      return false
    }
    return url.pathSegments.lastOrNull() in AUTH_ENDPOINTS
  }

  companion object {
    private const val HEADER_RETRY_ATTEMPTED = "X-Auth-Retry"
    private val AUTH_ENDPOINTS = setOf("login", "register", "refresh")
  }
}
