package com.quizroyale.showdown.ui.game

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool
import com.quizroyale.showdown.R

/**
 * Thin wrapper around [SoundPool] that loads game SFX from `res/raw/`.
 *
 * Sound files are expected at:
 *   - `res/raw/sfx_correct.mp3`
 *   - `res/raw/sfx_wrong.mp3`
 *   - `res/raw/sfx_elimination.mp3`
 *   - `res/raw/sfx_victory.mp3`
 *   - `res/raw/sfx_powerup.mp3`
 *
 * If a resource ID is 0 (file missing / not yet added) the corresponding play call
 * is a no-op — the code compiles and runs silently until real audio files are dropped
 * in.
 *
 * Call [release] when the host composable leaves composition (use [DisposableEffect]).
 */
class GameSoundManager(context: Context) {

    private val audioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_GAME)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()

    private val soundPool: SoundPool = SoundPool.Builder()
        .setMaxStreams(MAX_STREAMS)
        .setAudioAttributes(audioAttributes)
        .build()

    // Sound IDs — 0 means the resource was not found; play calls are no-ops in that case.
    private val idCorrect: Int     = loadSafe(context, R.raw.sfx_correct)
    private val idWrong: Int       = loadSafe(context, R.raw.sfx_wrong)
    private val idElimination: Int = loadSafe(context, R.raw.sfx_elimination)
    private val idVictory: Int     = loadSafe(context, R.raw.sfx_victory)
    private val idPowerup: Int     = loadSafe(context, R.raw.sfx_powerup)

    // ── Public API ────────────────────────────────────────────────────────────

    /** Play the "correct answer" chime. */
    fun playCorrect()     = play(idCorrect)

    /** Play the "wrong answer" buzz. */
    fun playWrong()       = play(idWrong)

    /** Play the elimination sting. */
    fun playElimination() = play(idElimination)

    /** Play the victory fanfare. */
    fun playVictory()     = play(idVictory)

    /** Play the power-up activation sound. */
    fun playPowerup()     = play(idPowerup)

    /**
     * Release [SoundPool] resources.  Call this from a [DisposableEffect] cleanup block
     * in the composable that owns this instance.
     */
    fun release() {
        soundPool.release()
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private fun loadSafe(context: Context, resId: Int): Int =
        runCatching { soundPool.load(context, resId, PRIORITY) }.getOrDefault(0)

    private fun play(soundId: Int) {
        if (soundId == 0) return
        soundPool.play(
            soundId,
            /* leftVolume  = */ LEFT_VOLUME,
            /* rightVolume = */ RIGHT_VOLUME,
            /* priority    = */ PRIORITY,
            /* loop        = */ NO_LOOP,
            /* rate        = */ NORMAL_RATE,
        )
    }

    private companion object {
        const val MAX_STREAMS  = 5
        const val PRIORITY     = 1
        const val NO_LOOP      = 0
        const val LEFT_VOLUME  = 1f
        const val RIGHT_VOLUME = 1f
        const val NORMAL_RATE  = 1f
    }
}
