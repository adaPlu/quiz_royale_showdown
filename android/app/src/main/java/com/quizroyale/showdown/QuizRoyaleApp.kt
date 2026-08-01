package com.quizroyale.showdown

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class QuizRoyaleApp : Application() {
    override fun onCreate() {
        super.onCreate()
    }
}
