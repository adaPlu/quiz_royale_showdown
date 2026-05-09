package com.quizroyale.showdown.data.auth

import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TokenRefreshInterceptor @Inject constructor(
  private val authRepository: AuthRepository
) : Interceptor {
  override fun intercept(chain: Interceptor.Chain): Response {
    val token = authRepository.currentAccessToken()
    val request = if (token != null) {
      chain.request().newBuilder().addHeader("Authorization", "Bearer $token").build()
    } else {
      chain.request()
    }
    return chain.proceed(request)
  }
}
