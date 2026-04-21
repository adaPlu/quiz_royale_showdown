package com.quizroyale.showdown

import android.app.Application
import com.google.firebase.crashlytics.FirebaseCrashlytics
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class QuizRoyaleApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // Disable Crashlytics in debug builds; always on in release
        FirebaseCrashlytics.getInstance().setCrashlyticsCollectionEnabled(!BuildConfig.DEBUG)
    }
}
