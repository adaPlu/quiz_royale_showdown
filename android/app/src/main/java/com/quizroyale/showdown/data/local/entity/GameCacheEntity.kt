package com.quizroyale.showdown.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "game_cache")
data class GameCacheEntity(
    @PrimaryKey val roomId: String,
    val roomCode: String,
    val phase: String,
    val roundNumber: Int,
    val totalRounds: Int,
    val cachedAt: Long = System.currentTimeMillis(),
    /** JSON-serialized powerup inventory map, e.g. {"DOUBLE_POINTS":1,"SHIELD":2} */
    val powerupInventoryJson: String? = null,
)
