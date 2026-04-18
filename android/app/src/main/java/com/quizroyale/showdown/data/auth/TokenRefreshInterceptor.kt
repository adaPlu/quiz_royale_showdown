package com.quizroyale.showdown.data.auth

import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TokenRefreshInterceptor @Inject constructor(
  private val authRepository: AuthRepository
) : Interceptor {
  override fun intercept(chain: Interceptor.Chain): Response {
    var request = chain.request()
    authRepository.currentAccessToken()?.let { token ->
      request = request.newBuilder().addHeader("Authorization", "Bearer $token").build()
    }

    val response = chain.proceed(request)
    if (response.code != 401) {
      return response
    }

    response.close()
    val refreshedToken = runBlocking { authRepository.refreshIfPossible() } ?: return chain.proceed(request)
    val retryRequest = request.newBuilder()
      .header("Authorization", "Bearer ${refreshedToken.accessToken}")
      .build()
    return chain.proceed(retryRequest)
  }
}
