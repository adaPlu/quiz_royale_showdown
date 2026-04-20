package com.quizroyale.showdown.ui.game

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool

class GameSoundManager(context: Context) {

    private val pool: SoundPool = SoundPool.Builder()
        .setMaxStreams(5)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        )
        .build()

    private val soundIds: MutableMap<String, Int> = mutableMapOf()

    init {
        val res = context.resources
        val pkg = context.packageName
        listOf("sfx_correct", "sfx_wrong", "sfx_elimination", "sfx_victory", "sfx_powerup").forEach { name ->
            val id = res.getIdentifier(name, "raw", pkg)
            if (id != 0) soundIds[name] = pool.load(context, id, 1)
        }
    }

    fun playCorrect()     = play("sfx_correct")
    fun playWrong()       = play("sfx_wrong")
    fun playElimination() = play("sfx_elimination")
    fun playVictory()     = play("sfx_victory")
    fun playPowerup()     = play("sfx_powerup")

    private fun play(name: String) {
        soundIds[name]?.let { pool.play(it, 0.8f, 0.8f, 1, 0, 1f) }
    }

    fun release() = pool.release()
}
