package com.quizroyale.showdown.ui.screens.splash

import androidx.lifecycle.ViewModel
import com.quizroyale.showdown.data.auth.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

@HiltViewModel
class SplashViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {
    fun isLoggedIn(): Boolean = authRepository.currentAccessToken() != null
}
