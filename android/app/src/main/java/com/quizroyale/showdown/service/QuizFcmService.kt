package com.quizroyale.showdown.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.quizroyale.showdown.MainActivity
import com.quizroyale.showdown.data.auth.AuthRepository
import com.quizroyale.showdown.data.push.FcmTokenRequest
import com.quizroyale.showdown.data.push.PushApi
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class QuizFcmService : FirebaseMessagingService() {

    companion object {
        private const val CHANNEL_ID = "quiz_royale_game"
        private const val CHANNEL_NAME = "Quiz Royale"
        const val PREF_FILE = "quiz_fcm"
        const val PREF_TOKEN = "token"
        private val notifId = java.util.concurrent.atomic.AtomicInteger(0)
    }

    @Inject lateinit var authRepository: AuthRepository
    @Inject lateinit var pushApi: PushApi

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        val encryptedPrefs = EncryptedSharedPreferences.create(
            this,
            PREF_FILE,
            MasterKey.Builder(this).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
        encryptedPrefs.edit().putString(PREF_TOKEN, token).apply()

        // Upload immediately if the user is already logged in
        if (authRepository.currentAccessToken() != null) {
            serviceScope.launch {
                runCatching { pushApi.registerFcmToken(FcmTokenRequest(token)) }
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val title = message.notification?.title ?: message.data["title"] ?: "Quiz Royale"
        val body = message.notification?.body ?: message.data["body"] ?: run {
            android.util.Log.w("QuizFcmService", "Push received with missing body, data=${message.data}")
            return
        }
        showNotification(title, body)
    }

    private fun showNotification(title: String, body: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH)
            )
        }

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        nm.notify(notifId.incrementAndGet(), notification)
    }
}
